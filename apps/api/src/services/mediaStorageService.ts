import crypto from "crypto";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import type { MediaAsset } from "@prisma/client";
import COS = require("cos-nodejs-sdk-v5");
import { getCredential, getPolicy } from "qcloud-cos-sts";
import { config } from "../config";
import { maxMediaUploadBytes, uploadRoot } from "../middleware/upload";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";

const cosStorageUrlPrefix = "cos://";

type MediaUploadInput = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

type CosUploadIntent = {
  assetId: string;
  key: string;
  bucket: string;
  region: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
    startTime: number;
    expiredTime: number;
  };
};

function getCosClient() {
  if (config.MEDIA_STORAGE !== "cos") {
    throw new HttpError(409, "COS media storage is not enabled");
  }

  return new COS({
    SecretId: config.COS_SECRET_ID,
    SecretKey: config.COS_SECRET_KEY
  });
}

function getSafePrefix() {
  return config.COS_PREFIX.split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function getFileExtension(originalName: string) {
  const extension = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

function makeCosStorageUrl(storageKey: string) {
  return `${cosStorageUrlPrefix}${config.COS_BUCKET}/${storageKey}`;
}

function isCosAsset(asset: Pick<MediaAsset, "fileUrl">) {
  return asset.fileUrl.startsWith(cosStorageUrlPrefix);
}

function ensureSafeLocalStoragePath(storageKey: string) {
  const resolvedPath = path.resolve(uploadRoot, storageKey);
  const rootWithSeparator = `${uploadRoot}${path.sep}`;

  if (!resolvedPath.startsWith(rootWithSeparator)) {
    throw new Error("Refusing to access a media file outside the upload directory");
  }

  return resolvedPath;
}

export function validateMediaUploadInput(input: MediaUploadInput) {
  if (!input.originalName || input.originalName.length > 255) {
    throw new HttpError(400, "A valid media file name is required");
  }

  if (!input.mimeType.startsWith("image/") && !input.mimeType.startsWith("video/")) {
    throw new HttpError(400, "Only image or video uploads are supported");
  }

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maxMediaUploadBytes) {
    throw new HttpError(400, "Media files must be between 1 byte and 250 MB");
  }
}

export async function prepareCosMediaUpload(
  workspaceId: string,
  userId: string,
  input: MediaUploadInput
): Promise<CosUploadIntent> {
  if (config.MEDIA_STORAGE !== "cos") {
    throw new HttpError(409, "COS direct upload is not enabled on this server");
  }

  validateMediaUploadInput(input);

  const datePrefix = new Date().toISOString().slice(0, 10);
  const prefix = getSafePrefix();
  const key = [prefix, "workspaces", workspaceId, datePrefix, `${crypto.randomUUID()}${getFileExtension(input.originalName)}`]
    .filter(Boolean)
    .join("/");

  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId,
      uploadedBy: userId,
      fileUrl: makeCosStorageUrl(key),
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: "uploading",
      metadata: {
        originalName: input.originalName,
        storage: "cos"
      }
    }
  });

  try {
    const policy = getPolicy([
      {
        action: [
          "name/cos:PutObject",
          "name/cos:HeadObject",
          "name/cos:InitiateMultipartUpload",
          "name/cos:ListMultipartUploads",
          "name/cos:ListParts",
          "name/cos:UploadPart",
          "name/cos:CompleteMultipartUpload",
          "name/cos:AbortMultipartUpload"
        ],
        bucket: config.COS_BUCKET,
        region: config.COS_REGION,
        prefix: key
      }
    ]);
    const credential = await getCredential({
      secretId: config.COS_SECRET_ID,
      secretKey: config.COS_SECRET_KEY,
      durationSeconds: config.COS_TEMP_CREDENTIAL_DURATION_SECONDS,
      policy
    });

    return {
      assetId: asset.id,
      key,
      bucket: config.COS_BUCKET,
      region: config.COS_REGION,
      credentials: {
        tmpSecretId: credential.credentials.tmpSecretId,
        tmpSecretKey: credential.credentials.tmpSecretKey,
        sessionToken: credential.credentials.sessionToken,
        startTime: credential.startTime,
        expiredTime: credential.expiredTime
      }
    };
  } catch (error) {
    await prisma.mediaAsset.delete({ where: { id: asset.id } }).catch(() => undefined);
    throw error;
  }
}

export async function completeCosMediaUpload(
  workspaceId: string,
  userId: string,
  assetId: string
) {
  if (config.MEDIA_STORAGE !== "cos") {
    throw new HttpError(409, "COS direct upload is not enabled on this server");
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id: assetId,
      workspaceId,
      uploadedBy: userId,
      status: "uploading"
    }
  });

  if (!asset || !isCosAsset(asset)) {
    throw new HttpError(404, "Pending COS upload was not found");
  }

  let object;

  try {
    object = await getCosClient().headObject({
      Bucket: config.COS_BUCKET,
      Region: config.COS_REGION,
      Key: asset.storageKey
    });
  } catch (error) {
    throw new HttpError(409, "COS file was not found. Upload the file again before saving.", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
  const headers = object.headers ?? {};
  const contentLength = Number(headers["content-length"] ?? 0);
  const contentType = String(headers["content-type"] ?? "").toLowerCase();

  if (contentLength !== asset.sizeBytes) {
    throw new HttpError(400, "COS object size does not match the selected file");
  }

  if (contentType && !contentType.startsWith(asset.mimeType.toLowerCase())) {
    throw new HttpError(400, "COS object type does not match the selected file");
  }

  const readyAsset = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { status: "ready" }
  });

  return withResolvedMediaUrl(readyAsset);
}

export function getMediaAccessUrl(
  asset: Pick<MediaAsset, "fileUrl" | "storageKey">,
  purpose: "preview" | "publish" = "preview"
) {
  if (!isCosAsset(asset)) {
    return asset.fileUrl;
  }

  const expires = purpose === "publish"
    ? config.COS_PUBLISH_URL_EXPIRES_SECONDS
    : config.COS_PREVIEW_URL_EXPIRES_SECONDS;

  return getCosClient().getObjectUrl({
    Bucket: config.COS_BUCKET,
    Region: config.COS_REGION,
    Key: asset.storageKey,
    Sign: true,
    Expires: expires,
    Protocol: "https:"
  });
}

export function withResolvedMediaUrl<T extends MediaAsset>(asset: T, purpose: "preview" | "publish" = "preview") {
  return {
    ...asset,
    fileUrl: getMediaAccessUrl(asset, purpose)
  };
}

export async function deleteStoredMedia(asset: Pick<MediaAsset, "fileUrl" | "storageKey">) {
  if (isCosAsset(asset)) {
    await getCosClient().deleteObject({
      Bucket: config.COS_BUCKET,
      Region: config.COS_REGION,
      Key: asset.storageKey
    });
    return;
  }

  await fs.unlink(ensureSafeLocalStoragePath(asset.storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

export async function cleanUpExpiredMedia() {
  const now = Date.now();
  const uploadCutoff = new Date(now - config.MEDIA_UNUSED_RETENTION_HOURS * 60 * 60 * 1000);
  const unusedCutoff = uploadCutoff;
  const publishedCutoff = new Date(now - config.MEDIA_PUBLISHED_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const assets = await prisma.mediaAsset.findMany({
    where: {
      OR: [
        {
          status: "uploading",
          createdAt: { lt: uploadCutoff }
        },
        {
          status: "ready",
          createdAt: { lt: unusedCutoff },
          variantLinks: { none: {} }
        },
        {
          status: "ready",
          createdAt: { lt: publishedCutoff },
          variantLinks: {
            some: {},
            every: {
              postVariant: {
                publishStatus: "published"
              }
            }
          }
        }
      ]
    },
    take: 100
  });

  let deleted = 0;
  let failed = 0;

  for (const asset of assets) {
    try {
      await deleteStoredMedia(asset);
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to clean media asset ${asset.id}`, error);
    }
  }

  return { scanned: assets.length, deleted, failed };
}

export async function migrateLegacyLocalMediaToCos(limit = 100) {
  if (config.MEDIA_STORAGE !== "cos") {
    throw new HttpError(409, "Set MEDIA_STORAGE=cos before migrating local media");
  }

  const assets = await prisma.mediaAsset.findMany({
    where: {
      status: "ready",
      fileUrl: {
        contains: "/uploads/"
      }
    },
    orderBy: {
      createdAt: "asc"
    },
    take: limit
  });
  const cos = getCosClient();
  let migrated = 0;
  let failed = 0;

  for (const asset of assets) {
    try {
      const localPath = ensureSafeLocalStoragePath(asset.storageKey);
      const file = await fs.stat(localPath);
      const key = [
        getSafePrefix(),
        "workspaces",
        asset.workspaceId,
        "migrated",
        `${asset.id}${getFileExtension(asset.storageKey)}`
      ]
        .filter(Boolean)
        .join("/");

      await cos.putObject({
        Bucket: config.COS_BUCKET,
        Region: config.COS_REGION,
        Key: key,
        Body: createReadStream(localPath),
        ContentType: asset.mimeType,
        ContentLength: file.size
      });
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          fileUrl: makeCosStorageUrl(key),
          storageKey: key
        }
      });
      await fs.unlink(localPath);
      migrated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to migrate local media asset ${asset.id}`, error);
    }
  }

  return { scanned: assets.length, migrated, failed };
}
