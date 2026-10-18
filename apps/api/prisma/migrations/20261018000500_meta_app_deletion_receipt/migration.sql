-- Additive independent interaction metadata only. Never infer authorization
-- timestamps for older grants from token/status updates or publishing records.
ALTER TABLE "InstagramManagementConnection" ADD COLUMN "authorizedAt" TIMESTAMP(3);

CREATE TABLE "MetaInboxAppDeletionRequest" (
 "id" UUID NOT NULL,
 "platform" TEXT NOT NULL,
 "appId" TEXT NOT NULL,
 "subjectHash" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "reason" TEXT NOT NULL,
 "confirmationCode" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending',
 "targetEncrypted" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3),
 CONSTRAINT "MetaInboxAppDeletionRequest_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "meta_app_deletion_namespace" CHECK (platform IN ('facebook','instagram') AND "appId" ~ '^[0-9]{1,256}$'),
 CONSTRAINT "meta_app_deletion_proof_digest" CHECK ("subjectHash" ~ '^[a-f0-9]{64}$' AND "requestKey" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "meta_app_deletion_reason" CHECK (reason IN ('data_deletion','deauthorization')),
 CONSTRAINT "meta_app_deletion_receipt" CHECK ("confirmationCode" ~ '^[A-Za-z0-9_-]{43}$'),
 CONSTRAINT "meta_app_deletion_state" CHECK ((status='pending' AND "completedAt" IS NULL AND "targetEncrypted" IS NOT NULL) OR (status='completed' AND "completedAt" IS NOT NULL AND "targetEncrypted" IS NULL))
);
CREATE UNIQUE INDEX "MetaInboxAppDeletionRequest_requestKey_key" ON "MetaInboxAppDeletionRequest"("requestKey");
CREATE UNIQUE INDEX "MetaInboxAppDeletionRequest_confirmationCode_key" ON "MetaInboxAppDeletionRequest"("confirmationCode");
CREATE INDEX "MetaInboxAppDeletionRequest_status_createdAt_idx" ON "MetaInboxAppDeletionRequest"("status","createdAt");
