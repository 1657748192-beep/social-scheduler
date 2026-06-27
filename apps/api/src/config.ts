import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),
  X_CLIENT_ID: z.string().optional().default(""),
  X_CLIENT_SECRET: z.string().optional().default(""),
  FACEBOOK_CLIENT_ID: z.string().optional().default(""),
  FACEBOOK_CLIENT_SECRET: z.string().optional().default(""),
  INSTAGRAM_CLIENT_ID: z.string().optional().default(""),
  INSTAGRAM_CLIENT_SECRET: z.string().optional().default("")
});

export const config = envSchema.parse(process.env);
