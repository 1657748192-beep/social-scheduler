-- CreateTable
CREATE TABLE "instagram_received_comments" (
    "id" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "providerCommentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "text" TEXT,
    "senderId" TEXT,
    "username" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_received_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_received_threads" (
    "id" UUID NOT NULL,
    "socialAccountId" UUID NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "providerConversationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_received_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_received_messages" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "text" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "inbound" BOOLEAN NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_received_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_reception_states" (
    "socialAccountId" UUID NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "lastReceivedAt" TIMESTAMP(3),

    CONSTRAINT "instagram_reception_states_pkey" PRIMARY KEY ("socialAccountId")
);

-- CreateIndex
CREATE INDEX "instagram_received_comments_socialAccountId_mediaId_id_idx" ON "instagram_received_comments"("socialAccountId", "mediaId", "id");

-- CreateIndex
CREATE INDEX "instagram_received_comments_receivedAt_idx" ON "instagram_received_comments"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_received_comments_socialAccountId_providerComment_key" ON "instagram_received_comments"("socialAccountId", "providerCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_received_threads_socialAccountId_counterpartyId_key" ON "instagram_received_threads"("socialAccountId", "counterpartyId");

-- CreateIndex
CREATE INDEX "instagram_received_messages_threadId_id_idx" ON "instagram_received_messages"("threadId", "id");

-- CreateIndex
CREATE INDEX "instagram_received_messages_receivedAt_idx" ON "instagram_received_messages"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_received_messages_threadId_providerMessageId_key" ON "instagram_received_messages"("threadId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "instagram_received_comments" ADD CONSTRAINT "instagram_received_comments_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_received_threads" ADD CONSTRAINT "instagram_received_threads_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_received_messages" ADD CONSTRAINT "instagram_received_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "instagram_received_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_reception_states" ADD CONSTRAINT "instagram_reception_states_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
