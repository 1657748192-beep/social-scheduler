-- Independent reply metadata only. A payload digest cannot identify its target;
-- legacy targets stay unknown rather than being inferred from published posts.
ALTER TABLE "facebook_interaction_send_attempts" ADD COLUMN "targetHash" TEXT;
ALTER TABLE "facebook_interaction_send_attempts" ADD CONSTRAINT "fb_send_target_digest"
  CHECK ("targetHash" IS NULL OR "targetHash" = 'deleted' OR "targetHash" ~ '^[0-9a-f]{64}$');
CREATE INDEX "fb_send_target_scope"
  ON "facebook_interaction_send_attempts"("managedPageId", "connectionVersion", "targetHash");
