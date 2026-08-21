import type { MediaAsset, Prisma, WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import {
  composerPlatformOrder,
  composerPlatformLimits,
  getComposerPlatformLimit,
  type ComposerPlatform
} from "../config/platformLimits";
import { isRealPublishingSupported } from "../integrations/social/registry";
import { getPinterestPinValidationError } from "../integrations/social/pinterestPublishing";
import { readTikTokPublishSettings } from "../integrations/social/tiktokPublisher";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";
import {
  completeCosMediaUpload,
  prepareCosMediaUpload,
  validateMediaUploadInput,
  withResolvedMediaUrl
} from "./mediaStorageService";
import { enqueuePublishJobs } from "./scheduleService";
import { requireWorkspaceMembership, requireWorkspacePublishingAccess } from "./workspaceService";

const writableRoles: WorkspaceRole[] = ["owner", "admin", "editor"];
const maxPostTargets = 50;

const variantSchema = z.object({
  socialAccountId: z.string().uuid(),
  platform: z.enum(composerPlatformOrder),
  text: z.string().default(""),
  mediaAssetIds: z.array(z.string().uuid()).default([]),
  platformPayload: z.record(z.unknown()).default({})
});

export const createComposerPostSchema = z.object({
  title: z.string().max(120).optional(),
  baseText: z.string().min(1).max(63206),
  variants: z.array(variantSchema).min(1).max(maxPostTargets),
  scheduledAt: z.string().datetime().optional(),
  publishNow: z.boolean().optional().default(false)
});

export const updateComposerPostSchema = createComposerPostSchema.partial().extend({
  variants: z.array(variantSchema).min(1).max(maxPostTargets).optional()
});

export const prepareCosMediaUploadSchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive()
});

export const completeCosMediaUploadSchema = z.object({
  assetId: z.string().uuid()
});

export function getComposerPlatforms() {
  return Object.values(composerPlatformLimits);
}

function ensureCanWrite(role: WorkspaceRole) {
  if (!writableRoles.includes(role)) {
    throw new HttpError(403, "Viewer role cannot create or edit content");
  }
}

async function resolveVariantMediaUrls<T extends { media: Array<{ mediaAsset: MediaAsset }> }>(
  variant: T
) {
  return {
    ...variant,
    media: variant.media.map((item) => ({
      ...item,
      mediaAsset: withResolvedMediaUrl(item.mediaAsset)
    }))
  };
}

async function resolvePostMediaUrls<T extends { variants: Array<{ media: Array<{ mediaAsset: MediaAsset }> }> }>(
  post: T
) {
  return {
    ...post,
    variants: await Promise.all(post.variants.map((variant) => resolveVariantMediaUrls(variant)))
  };
}

function validateVariant(platform: ComposerPlatform, text: string, mediaCount: number) {
  const limit = getComposerPlatformLimit(platform);
  const errors: Array<{ code: string; message: string; limit: number; actual: number }> = [];

  if (text.length > limit.maxTextLength) {
    errors.push({
      code: "text_too_long",
      message: `${limit.label} text is over the ${limit.maxTextLength} character limit`,
      limit: limit.maxTextLength,
      actual: text.length
    });
  }

  if (mediaCount > limit.maxImages) {
    errors.push({
      code: "too_many_images",
      message: `${limit.label} allows up to ${limit.maxImages} media assets`,
      limit: limit.maxImages,
      actual: mediaCount
    });
  }

  return errors;
}

async function getReadyWorkspaceMediaById(workspaceId: string, mediaAssetIds: string[]) {
  const uniqueIds = Array.from(new Set(mediaAssetIds));

  if (!uniqueIds.length) {
    return new Map<string, { mimeType: string; fileUrl: string }>();
  }

  const mediaAssets = await prisma.mediaAsset.findMany({
    where: {
      id: {
        in: uniqueIds
      },
      workspaceId,
      status: "ready"
    },
    select: {
      id: true,
      mimeType: true,
      fileUrl: true
    }
  });

  if (mediaAssets.length !== uniqueIds.length) {
    throw new HttpError(400, "One or more media assets are invalid for this workspace");
  }

  return new Map(mediaAssets.map((asset) => [asset.id, asset]));
}

async function assertVariantsTargetActiveWorkspaceAccounts(
  workspaceId: string,
  variants: z.infer<typeof variantSchema>[]
) {
  const socialAccountIds = variants.map((variant) => variant.socialAccountId);

  if (new Set(socialAccountIds).size !== socialAccountIds.length) {
    throw new HttpError(400, "Each social account can only be selected once per post");
  }

  const accounts = await prisma.socialAccount.findMany({
    where: {
      id: { in: socialAccountIds },
      workspaceId,
      status: "active"
    },
    select: {
      id: true,
      platform: true
    }
  });

  if (accounts.length !== socialAccountIds.length) {
    throw new HttpError(400, "One or more selected social accounts are unavailable for this workspace");
  }

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const mismatchedVariant = variants.find(
    (variant) => accountsById.get(variant.socialAccountId)?.platform !== variant.platform
  );

  if (mismatchedVariant) {
    throw new HttpError(400, "Selected social account does not match its post platform");
  }
}

function assertVariantsSupportRealPublishing(variants: z.infer<typeof variantSchema>[]) {
  const unsupportedPlatforms = Array.from(
    new Set(variants.map((variant) => variant.platform).filter((platform) => !isRealPublishingSupported(platform)))
  );

  if (unsupportedPlatforms.length) {
    throw new HttpError(
      409,
      `Real publishing is not supported for ${unsupportedPlatforms.join(", ")} yet. Save this content as a draft instead.`
    );
  }
}

function assertTikTokPublishSettings(variants: z.infer<typeof variantSchema>[]) {
  const invalidVariant = variants.find((variant) => {
    if (variant.platform !== "tiktok") {
      return false;
    }

    return !readTikTokPublishSettings(variant.platformPayload as Prisma.JsonValue)?.consentConfirmed;
  });

  if (invalidVariant) {
    throw new HttpError(
      400,
      "Complete the TikTok privacy, interaction, and music usage confirmation settings before publishing."
    );
  }
}

function assertPinterestPublishSettings(
  variants: z.infer<typeof variantSchema>[],
  mediaById: Map<string, { mimeType: string; fileUrl: string }>
) {
  const invalidVariant = variants.find((variant) => {
    if (variant.platform !== "pinterest") {
      return false;
    }

    const media = variant.mediaAssetIds.map((mediaAssetId) => mediaById.get(mediaAssetId)!);
    return Boolean(getPinterestPinValidationError(variant.platformPayload as Prisma.JsonValue, media, variant.text));
  });

  if (invalidVariant) {
    const media = invalidVariant.mediaAssetIds.map((mediaAssetId) => mediaById.get(mediaAssetId)!);
    const message = getPinterestPinValidationError(
      invalidVariant.platformPayload as Prisma.JsonValue,
      media,
      invalidVariant.text
    );
    throw new HttpError(400, message ?? "Complete the Pinterest Pin settings before publishing.");
  }
}

export async function createComposerPost(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof createComposerPostSchema>
) {
  const membership =
    input.scheduledAt || input.publishNow
      ? await requireWorkspacePublishingAccess(userId, workspaceId)
      : await requireWorkspaceMembership(userId, workspaceId);
  ensureCanWrite(membership.role);

  const allMediaIds = input.variants.flatMap((variant) => variant.mediaAssetIds);
  const [mediaById] = await Promise.all([
    getReadyWorkspaceMediaById(workspaceId, allMediaIds),
    assertVariantsTargetActiveWorkspaceAccounts(workspaceId, input.variants)
  ]);

  const validationErrors = input.variants.flatMap((variant) =>
    validateVariant(variant.platform, variant.text, variant.mediaAssetIds.length).map((error) => ({
      platform: variant.platform,
      ...error
    }))
  );

  if ((input.scheduledAt || input.publishNow) && validationErrors.length) {
    throw new HttpError(400, "Cannot schedule a post with platform validation errors", validationErrors);
  }

  if (input.scheduledAt || input.publishNow) {
    assertVariantsSupportRealPublishing(input.variants);
    assertTikTokPublishSettings(input.variants);
    assertPinterestPublishSettings(input.variants, mediaById);
  }

  if (input.publishNow && input.scheduledAt) {
    throw new HttpError(400, "Choose either publish now or a scheduled time, not both");
  }

  const scheduledAt = input.publishNow ? new Date() : input.scheduledAt ? new Date(input.scheduledAt) : null;

  if (!input.publishNow && scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new HttpError(400, "scheduledAt must be in the future");
  }

  const publishJobsToQueue: Array<{ id: string; scheduledAt: Date }> = [];

  const post = await prisma.$transaction(async (tx) => {
    const createdPost = await tx.post.create({
      data: {
        workspaceId,
        authorId: userId,
        title: input.title,
        baseText: input.baseText,
        workflowStatus: scheduledAt ? "scheduled" : "draft"
      }
    });

    for (const variant of input.variants) {
      const errors = validateVariant(variant.platform, variant.text, variant.mediaAssetIds.length);
      const createdVariant = await tx.postVariant.create({
        data: {
          postId: createdPost.id,
          socialAccountId: variant.socialAccountId,
          platform: variant.platform,
          text: variant.text,
          platformPayload: variant.platformPayload as Prisma.InputJsonValue,
          validationErrors: errors,
          publishStatus: scheduledAt ? "queued" : "draft"
        }
      });

      if (variant.mediaAssetIds.length) {
        await tx.postVariantMedia.createMany({
          data: variant.mediaAssetIds.map((mediaAssetId, index) => ({
            postVariantId: createdVariant.id,
            mediaAssetId,
            sortOrder: index
          }))
        });
      }

      if (scheduledAt) {
        const schedule = await tx.schedule.create({
          data: {
            postVariantId: createdVariant.id,
            workspaceId,
            scheduledAt,
            timezone: "Asia/Shanghai",
            status: "scheduled",
            createdBy: userId
          }
        });

        const publishJob = await tx.publishJob.create({
          data: {
            scheduleId: schedule.id,
            postVariantId: createdVariant.id,
            workspaceId,
            status: "waiting",
            idempotencyKey: `${schedule.id}:${createdVariant.id}`
          }
        });

        publishJobsToQueue.push({
          id: publishJob.id,
          scheduledAt
        });
      }
    }

    return tx.post.findUniqueOrThrow({
      where: { id: createdPost.id },
      include: {
        variants: {
          include: {
            media: {
              include: {
                mediaAsset: true
              },
              orderBy: {
                sortOrder: "asc"
              }
            },
            schedules: true
          }
        }
      }
    });
  });

  await enqueuePublishJobs(publishJobsToQueue);

  return resolvePostMediaUrls(post);
}

export async function listComposerPosts(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const posts = await prisma.post.findMany({
    where: {
      workspaceId
    },
    include: {
      variants: {
        include: {
          media: {
            include: {
              mediaAsset: true
            },
            orderBy: {
              sortOrder: "asc"
            }
          },
          schedules: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 50
  });

  return Promise.all(posts.map((post) => resolvePostMediaUrls(post)));
}

export async function listWorkspaceDrafts(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      authorId: userId,
      workflowStatus: "draft"
    },
    include: {
      variants: {
        include: {
          socialAccount: {
            select: {
              id: true,
              displayName: true,
              platform: true,
              avatarUrl: true
            }
          },
          media: {
            include: {
              mediaAsset: true
            },
            orderBy: {
              sortOrder: "asc"
            }
          }
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 100
  });

  return Promise.all(
    posts.map(async (post) => ({
      ...(await resolvePostMediaUrls(post)),
      expiresAt: new Date(
        post.updatedAt.getTime() + config.DRAFT_RETENTION_HOURS * 60 * 60 * 1000
      )
    }))
  );
}

export async function deleteWorkspaceDraft(userId: string, workspaceId: string, postId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanWrite(membership.role);

  const draft = await prisma.post.findFirst({
    where: {
      id: postId,
      workspaceId,
      authorId: userId,
      workflowStatus: "draft"
    },
    select: {
      id: true
    }
  });

  if (!draft) {
    throw new HttpError(404, "Draft was not found");
  }

  await prisma.post.delete({ where: { id: draft.id } });
  return { ok: true };
}

export async function cleanUpExpiredDrafts() {
  const cutoff = new Date(Date.now() - config.DRAFT_RETENTION_HOURS * 60 * 60 * 1000);
  const drafts = await prisma.post.findMany({
    where: {
      workflowStatus: "draft",
      updatedAt: { lt: cutoff }
    },
    select: {
      id: true
    },
    take: 100
  });

  if (!drafts.length) {
    return { scanned: 0, deleted: 0 };
  }

  const result = await prisma.post.deleteMany({
    where: {
      id: { in: drafts.map((draft) => draft.id) },
      workflowStatus: "draft",
      updatedAt: { lt: cutoff }
    }
  });

  return { scanned: drafts.length, deleted: result.count };
}

export async function getComposerPost(userId: string, workspaceId: string, postId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      workspaceId
    },
    include: {
      variants: {
        include: {
          media: {
            include: {
              mediaAsset: true
            },
            orderBy: {
              sortOrder: "asc"
            }
          },
          schedules: true
        }
      }
    }
  });

  if (!post) {
    throw new HttpError(404, "Post not found");
  }

  return resolvePostMediaUrls(post);
}

export async function uploadWorkspaceMedia(
  userId: string,
  workspaceId: string,
  file: Express.Multer.File,
  thumbnail?: Express.Multer.File
) {
  const membership = await requireWorkspacePublishingAccess(userId, workspaceId);
  ensureCanWrite(membership.role);

  if (config.MEDIA_STORAGE === "cos") {
    throw new HttpError(409, "This server uses COS direct upload. Upload through the COS upload endpoint instead.");
  }

  if (!file) {
    throw new HttpError(400, "Media file is required");
  }

  validateMediaUploadInput({
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size
  });

  if (thumbnail && (!thumbnail.mimetype.startsWith("image/") || thumbnail.size > 100 * 1024)) {
    throw new HttpError(400, "Media thumbnail must be an image smaller than 100 KB");
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId,
      uploadedBy: userId,
      fileUrl: `${config.API_PUBLIC_URL}/uploads/${file.filename}`,
      storageKey: file.filename,
      thumbnailUrl: thumbnail ? `${config.API_PUBLIC_URL}/uploads/${thumbnail.filename}` : null,
      thumbnailStorageKey: thumbnail?.filename ?? null,
      thumbnailSizeBytes: thumbnail?.size ?? null,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      metadata: {
        originalName: file.originalname
      }
    }
  });

  return withResolvedMediaUrl(asset);
}

export async function listWorkspaceMedia(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const media = await prisma.mediaAsset.findMany({
    where: {
      workspaceId,
      status: "ready"
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 100
  });

  return media.map((asset) => withResolvedMediaUrl(asset));
}

export async function createCosMediaUploadIntent(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof prepareCosMediaUploadSchema>
) {
  const membership = await requireWorkspacePublishingAccess(userId, workspaceId);
  ensureCanWrite(membership.role);
  return prepareCosMediaUpload(workspaceId, userId, input);
}

export async function completeCosMediaUploadIntent(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof completeCosMediaUploadSchema>
) {
  const membership = await requireWorkspacePublishingAccess(userId, workspaceId);
  ensureCanWrite(membership.role);
  return completeCosMediaUpload(workspaceId, userId, input.assetId);
}
