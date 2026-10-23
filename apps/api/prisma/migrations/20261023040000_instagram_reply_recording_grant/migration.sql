CREATE TABLE "InstagramReplyRecordingGrant" (
 "id" UUID NOT NULL PRIMARY KEY, "workspaceId" UUID NOT NULL, "appId" TEXT NOT NULL,
 "providerAccountId" TEXT, "incomingKey" TEXT NOT NULL UNIQUE, "accountId" UUID, "userId" UUID,
 "connectionId" UUID, "connectionVersion" INTEGER, "sourceRecordId" UUID, "providerEventId" TEXT,
 "actorId" TEXT, "conversationId" TEXT, "occurredAt" TIMESTAMP(3) NOT NULL,
 "predecessorAttemptId" UUID, "predecessorProviderId" TEXT, "marker" TEXT, "payloadHash" TEXT,
 "expiresAt" TIMESTAMP(3) NOT NULL, "forgetAfter" TIMESTAMP(3) NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'available', "attemptId" UUID UNIQUE, "claimedAt" TIMESTAMP(3),
 "closedReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ig_grant_key" CHECK ("incomingKey" ~ '^[a-f0-9]{64}$'),
 CONSTRAINT "ig_grant_state" CHECK ("state" IN ('available','claimed','sent','failed','unknown','closed')),
 CONSTRAINT "ig_grant_occupancy" CHECK (
  ("state"='available' AND "attemptId" IS NULL AND "claimedAt" IS NULL) OR
  ("state" IN ('claimed','sent','failed','unknown') AND "attemptId" IS NOT NULL AND "claimedAt" IS NOT NULL) OR "state"='closed'),
 CONSTRAINT "ig_grant_lifetime" CHECK ("forgetAfter">="expiresAt" AND "forgetAfter">="occurredAt"+INTERVAL '24 hours'),
 CONSTRAINT "ig_grant_binding" CHECK ("state"='closed' OR
  ("providerAccountId" IS NOT NULL AND "accountId" IS NOT NULL AND "userId" IS NOT NULL AND
   "connectionId" IS NOT NULL AND "connectionVersion" IS NOT NULL AND "connectionVersion">0 AND "sourceRecordId" IS NOT NULL AND
   "providerEventId" IS NOT NULL AND "actorId" IS NOT NULL AND "conversationId" IS NOT NULL AND
   "predecessorAttemptId" IS NOT NULL AND "predecessorProviderId" IS NOT NULL AND "marker" IS NOT NULL AND "payloadHash" IS NOT NULL))
);
CREATE INDEX "InstagramReplyRecordingGrant_workspaceId_connectionId_actorId_idx" ON "InstagramReplyRecordingGrant"("workspaceId","connectionId","actorId");
CREATE INDEX "InstagramReplyRecordingGrant_state_forgetAfter_idx" ON "InstagramReplyRecordingGrant"("state","forgetAfter");
CREATE FUNCTION "ig_recording_grant_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."incomingKey"<>OLD."incomingKey" OR NEW."forgetAfter"<>OLD."forgetAfter" OR NEW."expiresAt"<>OLD."expiresAt" OR NEW."occurredAt"<>OLD."occurredAt" OR NEW."workspaceId"<>OLD."workspaceId" OR NEW."appId"<>OLD."appId" THEN
  RAISE EXCEPTION 'Immutable Instagram recording grant';
 END IF;
 IF NEW."state"<>OLD."state" AND NOT
   ((OLD."state"='available' AND NEW."state" IN ('claimed','closed')) OR
    (OLD."state"='claimed' AND NEW."state" IN ('sent','failed','unknown','closed')) OR
    (OLD."state" IN ('sent','failed','unknown') AND NEW."state"='closed')) THEN
  RAISE EXCEPTION 'Invalid Instagram recording grant transition';
 END IF;
 IF NEW."state"<>'closed' AND ROW(NEW."providerAccountId",NEW."accountId",NEW."userId",NEW."connectionId",NEW."connectionVersion",NEW."sourceRecordId",NEW."providerEventId",NEW."actorId",NEW."conversationId",NEW."predecessorAttemptId",NEW."predecessorProviderId",NEW."marker",NEW."payloadHash") IS DISTINCT FROM ROW(OLD."providerAccountId",OLD."accountId",OLD."userId",OLD."connectionId",OLD."connectionVersion",OLD."sourceRecordId",OLD."providerEventId",OLD."actorId",OLD."conversationId",OLD."predecessorAttemptId",OLD."predecessorProviderId",OLD."marker",OLD."payloadHash") THEN
  RAISE EXCEPTION 'Instagram recording binding cannot be replaced';
 END IF;
 IF OLD."attemptId" IS NOT NULL AND NEW."attemptId" IS DISTINCT FROM OLD."attemptId" AND NOT (NEW."state"='closed' AND NEW."attemptId" IS NULL) THEN
  RAISE EXCEPTION 'Instagram recording attempt cannot be replaced';
 END IF;
 IF OLD."claimedAt" IS NOT NULL AND NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt" THEN RAISE EXCEPTION 'Instagram recording claim cannot be reset'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "ig_recording_grant_immutable" BEFORE UPDATE ON "InstagramReplyRecordingGrant" FOR EACH ROW EXECUTE FUNCTION "ig_recording_grant_guard"();
