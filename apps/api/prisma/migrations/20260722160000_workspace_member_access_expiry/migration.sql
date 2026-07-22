ALTER TABLE "users"
ADD COLUMN "publishing_access_disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publishing_access_expires_at" TIMESTAMP(3);
