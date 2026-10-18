-- Additive independent interaction metadata only. Unknown old consent starts
-- remain null; never infer them from publishing accounts or token/status updates.
ALTER TABLE "InstagramManagementConnection" ADD COLUMN "authorizationStartedAt" TIMESTAMP(3);
CREATE INDEX "InstagramManagementConnection_appId_providerUserId_idx" ON "InstagramManagementConnection"("appId","providerUserId");
CREATE TABLE "MetaInboxGrantFence" (
 "id" UUID NOT NULL,
 "platform" TEXT NOT NULL,
 "appId" TEXT NOT NULL,
 "subjectHash" TEXT NOT NULL,
 "cutoff" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MetaInboxGrantFence_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "meta_grant_fence_namespace" CHECK (platform IN ('facebook','instagram') AND "appId" ~ '^[0-9]+$' AND length("appId") BETWEEN 1 AND 256),
 CONSTRAINT "meta_grant_fence_digest" CHECK ("subjectHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "meta_inbox_grant_fence_subject" ON "MetaInboxGrantFence"("platform","appId","subjectHash");
