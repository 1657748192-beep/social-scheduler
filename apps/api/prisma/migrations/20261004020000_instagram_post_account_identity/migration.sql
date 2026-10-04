ALTER TABLE "post_variants"
ADD COLUMN "instagram_provider_account_id" TEXT;

UPDATE "post_variants" AS variant
SET "instagram_provider_account_id" = account."provider_account_id"
FROM "social_accounts" AS account
WHERE variant."social_account_id" = account."id"
  AND variant."platform" = 'instagram'
  AND account."platform" = 'instagram';
