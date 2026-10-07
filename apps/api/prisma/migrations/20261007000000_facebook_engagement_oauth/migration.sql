ALTER TABLE "oauth_states"
ADD COLUMN "facebook_engagement_social_account_id" UUID,
ADD COLUMN "facebook_expected_token_hash" TEXT,
ADD COLUMN "facebook_expected_page_id" TEXT;

ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_facebook_engagement_social_account_id_fkey"
FOREIGN KEY ("facebook_engagement_social_account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
