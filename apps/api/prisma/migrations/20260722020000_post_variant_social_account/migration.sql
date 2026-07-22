-- social_account_id and its foreign key were already created in the initial schema.
-- Keep this migration idempotent because production databases may already have the index
-- after a previously interrupted deployment.
CREATE INDEX IF NOT EXISTS "post_variants_social_account_id_idx"
  ON "post_variants"("social_account_id");
