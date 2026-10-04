ALTER TABLE "oauth_states"
  ADD COLUMN "instagram_engagement_social_account_id" UUID;

ALTER TABLE "oauth_states"
  ADD CONSTRAINT "oauth_states_instagram_engagement_social_account_id_fkey"
  FOREIGN KEY ("instagram_engagement_social_account_id")
  REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "oauth_states_instagram_engagement_social_account_id_idx"
  ON "oauth_states"("instagram_engagement_social_account_id");
