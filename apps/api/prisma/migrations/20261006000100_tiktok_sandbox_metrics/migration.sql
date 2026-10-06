-- Additive only: intentionally do not reconcile historical schema drift.
CREATE TABLE "tiktok_sandbox_credentials" (
 "id" UUID PRIMARY KEY, "userId" UUID NOT NULL, "workspaceId" UUID NOT NULL,
 "socialAccountId" UUID NOT NULL UNIQUE, "clientKey" TEXT NOT NULL,
 "openId" TEXT NOT NULL, "unionId" TEXT NOT NULL, "accessTokenEncrypted" TEXT NOT NULL,
 "refreshTokenEncrypted" TEXT, "scopes" TEXT[] NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "refreshTokenExpiresAt" TIMESTAMP(3), "revision" UUID NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "tiktok_sandbox_oauth_states" (
 "id" UUID PRIMARY KEY, "stateHash" TEXT NOT NULL UNIQUE,
 "userId" UUID NOT NULL, "workspaceId" UUID NOT NULL, "socialAccountId" UUID NOT NULL,
 "sessionId" UUID NOT NULL, "clientKey" TEXT NOT NULL, "expectedUnionId" TEXT NOT NULL,
 "redirectUri" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tiktok_sandbox_oauth_states_expiresAt_idx" ON "tiktok_sandbox_oauth_states"("expiresAt");
