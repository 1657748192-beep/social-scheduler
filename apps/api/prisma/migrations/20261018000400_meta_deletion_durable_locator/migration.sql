-- Additive interaction-only metadata. No publishing tables or credentials are touched.
ALTER TABLE "MetaInboxDeletionRequest"
 ADD COLUMN "targetEncrypted" TEXT,
 ADD COLUMN "requestKey" TEXT,
 ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "MetaInboxDeletionRequest_requestKey_key" ON "MetaInboxDeletionRequest"("requestKey");
ALTER TABLE "MetaInboxDeletionRequest" ADD CONSTRAINT "meta_deletion_attempt_bounds" CHECK ("attempts" >= 0 AND "attempts" <= 8);
