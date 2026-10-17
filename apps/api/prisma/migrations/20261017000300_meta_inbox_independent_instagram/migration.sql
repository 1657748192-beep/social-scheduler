-- AlterTable
ALTER TABLE "InteractionAsset" ADD COLUMN     "instagramConnectionId" UUID;

-- CreateTable
CREATE TABLE "InstagramManagementConnection" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "platform" NOT NULL DEFAULT 'instagram',
    "appId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "tokenEncrypted" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "subscribedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramManagementConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramManagementOAuthState" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "appId" TEXT NOT NULL,
    "expectedProviderAccountId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramManagementOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramInteractionEvent" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "connectionVersion" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "InstagramInteractionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramInteractionMessage" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "connectionVersion" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "inbound" BOOLEAN NOT NULL,
    "text" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InstagramInteractionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramInteractionComment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "connectionVersion" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "parentId" TEXT,
    "inbound" BOOLEAN NOT NULL DEFAULT true,
    "text" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InstagramInteractionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramInteractionSendAttempt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "connectionVersion" INTEGER NOT NULL,
    "requestKey" UUID NOT NULL,
    "targetHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerId" TEXT,
    "diagnosticId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramInteractionSendAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInboxDeletionRequest" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmationCode" TEXT NOT NULL,
    "claimToken" UUID,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MetaInboxDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInboxDeletionMarker" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaInboxDeletionMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstagramManagementConnection_appId_providerAccountId_statu_idx" ON "InstagramManagementConnection"("appId", "providerAccountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramManagementConnection_workspaceId_id_key" ON "InstagramManagementConnection"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ig_management_asset_scope" ON "InstagramManagementConnection"("workspaceId", "id", "appId", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ig_management_connection_namespace" ON "InstagramManagementConnection"("workspaceId", "appId", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramManagementOAuthState_stateHash_key" ON "InstagramManagementOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "InstagramManagementOAuthState_expiresAt_idx" ON "InstagramManagementOAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "InstagramInteractionEvent_status_nextAttemptAt_idx" ON "InstagramInteractionEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "InstagramInteractionEvent_receivedAt_idx" ON "InstagramInteractionEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramInteractionEvent_workspaceId_id_key" ON "InstagramInteractionEvent"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ig_interaction_event_dedup" ON "InstagramInteractionEvent"("connectionId", "connectionVersion", "eventKey");

-- CreateIndex
CREATE INDEX "InstagramInteractionMessage_connectionId_conversationId_occ_idx" ON "InstagramInteractionMessage"("connectionId", "conversationId", "occurredAt");

-- CreateIndex
CREATE INDEX "InstagramInteractionMessage_receivedAt_idx" ON "InstagramInteractionMessage"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramInteractionMessage_workspaceId_id_key" ON "InstagramInteractionMessage"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ig_interaction_message_dedup" ON "InstagramInteractionMessage"("connectionId", "connectionVersion", "providerId");

-- CreateIndex
CREATE INDEX "InstagramInteractionComment_connectionId_mediaId_occurredAt_idx" ON "InstagramInteractionComment"("connectionId", "mediaId", "occurredAt");

-- CreateIndex
CREATE INDEX "InstagramInteractionComment_receivedAt_idx" ON "InstagramInteractionComment"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramInteractionComment_workspaceId_id_key" ON "InstagramInteractionComment"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ig_interaction_comment_dedup" ON "InstagramInteractionComment"("connectionId", "connectionVersion", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramInteractionSendAttempt_workspaceId_id_key" ON "InstagramInteractionSendAttempt"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ig_interaction_send_key" ON "InstagramInteractionSendAttempt"("connectionId", "connectionVersion", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInboxDeletionRequest_confirmationCode_key" ON "MetaInboxDeletionRequest"("confirmationCode");

-- CreateIndex
CREATE INDEX "MetaInboxDeletionRequest_status_createdAt_idx" ON "MetaInboxDeletionRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "meta_inbox_deleted_subject" ON "MetaInboxDeletionMarker"("workspaceId", "platform", "appId", "subjectKind", "subjectHash");

-- AddForeignKey
ALTER TABLE "InteractionAsset" ADD CONSTRAINT "InteractionAsset_workspaceId_instagramConnectionId_appName_fkey" FOREIGN KEY ("workspaceId", "instagramConnectionId", "appNamespace", "providerAssetId") REFERENCES "InstagramManagementConnection"("workspaceId", "id", "appId", "providerAccountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT "InstagramManagementConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT "InstagramManagementConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT "InstagramManagementConnection_workspaceId_platform_provide_fkey" FOREIGN KEY ("workspaceId", "platform", "providerAccountId") REFERENCES "social_accounts"("workspace_id", "platform", "provider_account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramManagementOAuthState" ADD CONSTRAINT "InstagramManagementOAuthState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramManagementOAuthState" ADD CONSTRAINT "InstagramManagementOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramInteractionEvent" ADD CONSTRAINT "InstagramInteractionEvent_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "InstagramManagementConnection"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramInteractionMessage" ADD CONSTRAINT "InstagramInteractionMessage_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "InstagramManagementConnection"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramInteractionComment" ADD CONSTRAINT "InstagramInteractionComment_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "InstagramManagementConnection"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramInteractionSendAttempt" ADD CONSTRAINT "InstagramInteractionSendAttempt_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "InstagramManagementConnection"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInboxDeletionRequest" ADD CONSTRAINT "MetaInboxDeletionRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInboxDeletionMarker" ADD CONSTRAINT "MetaInboxDeletionMarker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only interaction-domain constraints change; no publishing data is migrated.
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT ig_management_platform CHECK (platform='instagram');
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT ig_management_version CHECK (version>0);
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT ig_management_status CHECK (status IN ('inactive','active','authorization_invalid','disconnected','expired'));
ALTER TABLE "InstagramInteractionEvent" ADD CONSTRAINT ig_event_version CHECK ("connectionVersion">0 AND attempts>=0 AND attempts<=8);
ALTER TABLE "InstagramInteractionMessage" ADD CONSTRAINT ig_message_version CHECK ("connectionVersion">0);
ALTER TABLE "InstagramInteractionComment" ADD CONSTRAINT ig_comment_version CHECK ("connectionVersion">0);
ALTER TABLE "InstagramInteractionSendAttempt" ADD CONSTRAINT ig_send_status CHECK ("connectionVersion">0 AND status IN ('pending','sent','failed','unknown'));
ALTER TABLE "MetaInboxDeletionRequest" ADD CONSTRAINT meta_deletion_namespace CHECK (platform IN ('facebook','instagram') AND "subjectKind" IN ('actor','asset','app_user','item'));
ALTER TABLE "MetaInboxDeletionMarker" ADD CONSTRAINT meta_marker_namespace CHECK (platform IN ('facebook','instagram') AND "subjectKind" IN ('actor','asset','app_user','item'));
ALTER TABLE "InteractionAsset" DROP CONSTRAINT inbox_asset_connection;
ALTER TABLE "InteractionAsset" ADD CONSTRAINT inbox_asset_connection CHECK (
 (platform='facebook' AND "facebookManagedPageId" IS NOT NULL AND "connectionId" IS NULL AND "instagramConnectionId" IS NULL)
 OR (platform='instagram' AND "instagramConnectionId" IS NOT NULL AND "facebookManagedPageId" IS NULL AND "connectionId" IS NULL)
 OR (platform IN ('youtube','tiktok','pinterest') AND "connectionId" IS NOT NULL AND "facebookManagedPageId" IS NULL AND "instagramConnectionId" IS NULL)
);
