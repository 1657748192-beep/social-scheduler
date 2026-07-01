import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("30d"),
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
  PINTEREST_CLIENT_ID: z.string().optional().default(""),
  PINTEREST_CLIENT_SECRET: z.string().optional().default("")
});

export const config = envSchema.parse(process.env);
