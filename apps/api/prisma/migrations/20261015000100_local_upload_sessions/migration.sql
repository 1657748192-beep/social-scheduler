CREATE TABLE "local_upload_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "client_key" UUID NOT NULL,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "part_hashes" TEXT[] NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'receiving',
  "reserved_bytes" INTEGER NOT NULL,
  "activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "merge_attempt_id" UUID,
  "merge_lease_until" TIMESTAMP(3),
  "cleanup_token" UUID,
  "cleanup_lease_until" TIMESTAMP(3),
  "residue_cleared_at" TIMESTAMP(3),
  "media_asset_id" UUID,
  "thumbnail_storage_key" TEXT,
  "thumbnail_size_bytes" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "local_upload_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "local_upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "local_upload_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "local_upload_sessions_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "local_upload_sessions_user_id_workspace_id_client_key_key" ON "local_upload_sessions"("user_id", "workspace_id", "client_key");
CREATE UNIQUE INDEX "local_upload_sessions_media_asset_id_key" ON "local_upload_sessions"("media_asset_id");
CREATE INDEX "local_upload_sessions_state_expires_at_idx" ON "local_upload_sessions"("state", "expires_at");
CREATE INDEX "local_upload_sessions_workspace_id_state_idx" ON "local_upload_sessions"("workspace_id", "state");
CREATE INDEX "local_upload_sessions_cleanup_lease_until_residue_cleared_at_idx" ON "local_upload_sessions"("cleanup_lease_until", "residue_cleared_at");

CREATE TABLE "local_upload_parts" (
  "session_id" UUID NOT NULL,
  "index" INTEGER NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "local_upload_parts_pkey" PRIMARY KEY ("session_id", "index"),
  CONSTRAINT "local_upload_parts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "local_upload_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "local_upload_parts_storage_key_key" ON "local_upload_parts"("storage_key");
