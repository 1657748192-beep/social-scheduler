export const PART_SIZE_BYTES = 1048576;
export const MAX_FILE_BYTES = 262144000;
export const CHUNK_THRESHOLD_BYTES = 8388608;
export type Manifest = { clientKey: string; originalName: string; mimeType: string; sizeBytes: number; partHashes: string[]; fingerprint: string };
export type UploadState = "receiving" | "assembling" | "completed" | "cancelled" | "expired";
export type UploadView = { id: string; state: UploadState; totalBytes: number; partSizeBytes: number; receivedParts: number[]; expiresAt: string; assetId: string | null };
export type UploadCapabilities = { protocol: "local-chunks-v1" | null; ownerUserId: string; partSizeBytes: number; thresholdBytes: number; maxFileBytes: number };

export async function computeFingerprint(sizeBytes: number, mimeType: string, hashes: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([sizeBytes, mimeType, hashes]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
