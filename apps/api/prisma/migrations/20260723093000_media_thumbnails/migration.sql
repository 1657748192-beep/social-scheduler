ALTER TABLE "media_assets"
ADD COLUMN "thumbnail_url" TEXT,
ADD COLUMN "thumbnail_storage_key" TEXT,
ADD COLUMN "thumbnail_size_bytes" INTEGER,
ADD COLUMN "original_deleted_at" TIMESTAMP(3),
ADD COLUMN "thumbnail_expires_at" TIMESTAMP(3);

CREATE INDEX "media_assets_status_thumbnail_expires_at_idx"
ON "media_assets"("status", "thumbnail_expires_at");
