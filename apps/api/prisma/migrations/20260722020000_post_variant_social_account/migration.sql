CREATE INDEX "post_variants_social_account_id_idx" ON "post_variants"("social_account_id");

ALTER TABLE "post_variants"
  ADD CONSTRAINT "post_variants_social_account_id_fkey"
  FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
