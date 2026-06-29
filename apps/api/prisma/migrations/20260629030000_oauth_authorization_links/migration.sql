CREATE TABLE "oauth_authorization_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "platform" "platform" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_by_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oauth_authorization_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_authorization_links_token_hash_key" ON "oauth_authorization_links"("token_hash");
CREATE INDEX "oauth_authorization_links_workspace_id_platform_expires_at_idx" ON "oauth_authorization_links"("workspace_id", "platform", "expires_at");

ALTER TABLE "oauth_authorization_links"
  ADD CONSTRAINT "oauth_authorization_links_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_authorization_links"
  ADD CONSTRAINT "oauth_authorization_links_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "oauth_states" ADD COLUMN "authorization_link_id" UUID;

ALTER TABLE "oauth_states"
  ADD CONSTRAINT "oauth_states_authorization_link_id_fkey"
  FOREIGN KEY ("authorization_link_id") REFERENCES "oauth_authorization_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
