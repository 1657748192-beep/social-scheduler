import { createHash } from "node:crypto";
import type { MediaAsset, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../../utils/errors";

export const PART_SIZE_BYTES = 1048576;
export const MAX_FILE_BYTES = 262144000;
export const CHUNK_THRESHOLD_BYTES = 8388608;
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_TTL_MS = 72 * 60 * 60 * 1000;
export const MERGE_TTL_MS = 10 * 60 * 1000;
export const MAX_RESERVED_BYTES = 2147483648;
export const MIN_FREE_BYTES = 2147483648n;

export type UploadActor = { userId: string; workspaceId: string };
export type Manifest = { clientKey: string; originalName: string; mimeType: string; sizeBytes: number; partHashes: string[]; fingerprint: string };
export type UploadState = "receiving" | "assembling" | "completed" | "cancelled" | "expired";
export type UploadView = { id: string; state: UploadState; totalBytes: number; partSizeBytes: number; receivedParts: number[]; expiresAt: string; assetId: string | null };
export type UploadCapabilities = { protocol: "local-chunks-v1" | null; ownerUserId: string; partSizeBytes: number; thresholdBytes: number; maxFileBytes: number };
export type ReadyMedia = MediaAsset & { originalAvailable: boolean };
export type SessionDeps = { db: PrismaClient; now: () => Date; availableBytes: () => Promise<bigint> };

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  clientKey: z.string().uuid(),
  originalName: z.string().min(1).max(255).refine(name => !/[\x00-\x1f/\\]/.test(name)),
  mimeType: z.string().max(100).regex(/^video\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
  partHashes: z.array(hashSchema).min(1).max(250),
  fingerprint: hashSchema
}).strict();

function fingerprint(sizeBytes: number, mimeType: string, hashes: string[]) {
  return createHash("sha256").update(JSON.stringify([sizeBytes, mimeType, hashes])).digest("hex");
}

export function parseManifest(value: unknown): Manifest {
  const manifest = manifestSchema.parse(value);
  if (manifest.partHashes.length !== Math.ceil(manifest.sizeBytes / PART_SIZE_BYTES) ||
      fingerprint(manifest.sizeBytes, manifest.mimeType, manifest.partHashes) !== manifest.fingerprint) {
    throw new HttpError(400, "Upload manifest is inconsistent");
  }
  return manifest;
}

export function expectedPartBytes(sizeBytes: number, index: number): number {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES ||
      !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(sizeBytes / PART_SIZE_BYTES)) {
    throw new HttpError(400, "Invalid upload part index or file size");
  }
  return Math.min(PART_SIZE_BYTES, sizeBytes - index * PART_SIZE_BYTES);
}

export async function computeFingerprint(sizeBytes: number, mimeType: string, hashes: string[]): Promise<string> {
  return fingerprint(sizeBytes, mimeType, hashes);
}
