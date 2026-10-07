CREATE TABLE "facebook_received_events" (
  "id" UUID NOT NULL, "socialAccountId" UUID NOT NULL, "eventKey" TEXT NOT NULL, "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT, "leaseUntil" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastError" TEXT,
  CONSTRAINT "facebook_received_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facebook_received_events_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "facebook_received_events_socialAccountId_eventKey_key" ON "facebook_received_events"("socialAccountId","eventKey");
CREATE INDEX "facebook_received_events_status_nextAttemptAt_idx" ON "facebook_received_events"("status","nextAttemptAt");

CREATE TABLE "facebook_received_comments" (
  "id" UUID NOT NULL, "socialAccountId" UUID NOT NULL, "providerCommentId" TEXT NOT NULL, "postId" TEXT NOT NULL,
  "text" TEXT, "senderId" TEXT, "senderName" TEXT, "deleted" BOOLEAN NOT NULL DEFAULT false,
  "occurredAt" TIMESTAMP(3) NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_received_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facebook_received_comments_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "facebook_received_comments_socialAccountId_providerCommentId_key" ON "facebook_received_comments"("socialAccountId","providerCommentId");
CREATE INDEX "facebook_received_comments_socialAccountId_postId_occurredAt_idx" ON "facebook_received_comments"("socialAccountId","postId","occurredAt");

CREATE TABLE "facebook_received_threads" (
  "id" UUID NOT NULL, "socialAccountId" UUID NOT NULL, "counterpartyId" TEXT NOT NULL,
  "lastInboundAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_received_threads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facebook_received_threads_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "facebook_received_threads_socialAccountId_counterpartyId_key" ON "facebook_received_threads"("socialAccountId","counterpartyId");

CREATE TABLE "facebook_received_messages" (
  "id" UUID NOT NULL, "threadId" UUID NOT NULL, "providerMessageId" TEXT NOT NULL, "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL, "text" TEXT, "inbound" BOOLEAN NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_received_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "facebook_received_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "facebook_received_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "facebook_received_messages_threadId_providerMessageId_key" ON "facebook_received_messages"("threadId","providerMessageId");
CREATE INDEX "facebook_received_messages_receivedAt_idx" ON "facebook_received_messages"("receivedAt");

CREATE TABLE "facebook_reception_states" (
  "socialAccountId" UUID NOT NULL, "revision" BIGINT NOT NULL DEFAULT 0, "lastReceivedAt" TIMESTAMP(3),
  CONSTRAINT "facebook_reception_states_pkey" PRIMARY KEY ("socialAccountId"),
  CONSTRAINT "facebook_reception_states_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
