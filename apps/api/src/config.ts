import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("24h"),
  ADMIN_EMAILS: z.string().optional().default(""),
  PASSWORD_RESET_TOKEN_MINUTES: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_DEBUG_LINKS: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  MEDIA_STORAGE: z.enum(["local", "cos"]).default("local"),
  COS_SECRET_ID: z.string().optional().default(""),
  COS_SECRET_KEY: z.string().optional().default(""),
  COS_BUCKET: z.string().optional().default(""),
  COS_REGION: z.string().optional().default(""),
  COS_PREFIX: z.string().default("social-scheduler"),
  COS_TEMP_CREDENTIAL_DURATION_SECONDS: z.coerce.number().int().min(900).max(7200).default(1800),
  COS_PREVIEW_URL_EXPIRES_SECONDS: z.coerce.number().int().min(60).max(7200).default(3600),
  COS_PUBLISH_URL_EXPIRES_SECONDS: z.coerce.number().int().min(900).max(604800).default(86400),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(5).default(1),
  MEDIA_UNUSED_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  MEDIA_PUBLISHED_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  MEDIA_FAILED_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  MEDIA_THUMBNAIL_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(180),
  DRAFT_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  MEDIA_CLEANUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),
  X_CLIENT_ID: z.string().optional().default(""),
  X_CLIENT_SECRET: z.string().optional().default(""),
  FACEBOOK_CLIENT_ID: z.string().optional().default(""),
  FACEBOOK_CLIENT_SECRET: z.string().optional().default(""),
  FACEBOOK_LOGIN_CONFIG_ID: z.string().optional().default(""),
  FACEBOOK_OAUTH_SCOPES: z.string().optional().default("public_profile"),
  INSTAGRAM_CLIENT_ID: z.string().optional().default(""),
  INSTAGRAM_CLIENT_SECRET: z.string().optional().default(""),
  INSTAGRAM_OAUTH_SCOPES: z
    .string()
    .optional()
    .default("instagram_business_basic,instagram_business_content_publish"),
  LINKEDIN_CLIENT_ID: z.string().optional().default(""),
  LINKEDIN_CLIENT_SECRET: z.string().optional().default(""),
  YOUTUBE_CLIENT_ID: z.string().optional().default(""),
  YOUTUBE_CLIENT_SECRET: z.string().optional().default(""),
  TIKTOK_CLIENT_ID: z.string().optional().default(""),
  TIKTOK_CLIENT_SECRET: z.string().optional().default(""),
  TIKTOK_OAUTH_SCOPES: z.string().optional().default("user.info.basic"),
  TIKTOK_DIRECT_POST_AUDITED: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  PINTEREST_CLIENT_ID: z.string().optional().default(""),
  PINTEREST_CLIENT_SECRET: z.string().optional().default("")
});

const parsedConfig = envSchema.parse(process.env);

if (parsedConfig.MEDIA_STORAGE === "cos") {
  const missingCosSettings = ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"].filter(
    (key) => !parsedConfig[key as "COS_SECRET_ID" | "COS_SECRET_KEY" | "COS_BUCKET" | "COS_REGION"]
  );

  if (missingCosSettings.length) {
    throw new Error(`MEDIA_STORAGE=cos requires: ${missingCosSettings.join(", ")}`);
  }
}

export const config = parsedConfig;

// Login sessions are deliberately short-lived. Keep this as a fixed product
// rule instead of allowing an environment value to accidentally extend a
// user's access beyond one day.
export const LOGIN_SESSION_DURATION = "24h";
export const LOGIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
