-- Independent management only. Never infer consent from token-refresh timestamps.
ALTER TABLE "facebook_management_connections"
  ADD COLUMN "authorizedAt" TIMESTAMP(3),
  ADD COLUMN "authorizationStartedAt" TIMESTAMP(3);
CREATE INDEX "facebook_management_connections_appId_providerUserId_idx"
  ON "facebook_management_connections"("appId", "providerUserId");
-- Existing ten-minute OAuth states remain unknown; only new states get a start time.
ALTER TABLE "facebook_management_oauth_states" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "facebook_management_oauth_states" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
