import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { config } from "../config";

const algorithm = "aes-256-gcm";

function getKey() {
  return createHash("sha256")
    .update(config.TOKEN_ENCRYPTION_KEY ?? config.JWT_SECRET)
    .digest();
}

// Domain-separated server-only key, stable across API restarts and shared by
// OAuth admission/deletion. No new credential or environment variable is needed.
export function deriveMetaDeletionKey(){
  return createHmac('sha256',getKey()).update('social-scheduler:meta-inbox-deletion:v1').digest('hex');
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string) {
  const [iv, authTag, encrypted] = value.split(".");

  if (!iv || !authTag || !encrypted) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = createDecipheriv(algorithm, getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
