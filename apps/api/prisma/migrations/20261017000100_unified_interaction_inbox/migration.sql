-- CreateTable
CREATE TABLE "InteractionConnection" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "appNamespace" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "tokenEncrypted" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionAsset" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appNamespace" TEXT NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "connectionId" UUID,
    "facebookManagedPageId" UUID,
    "connectionVersion" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionCustomer" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractionCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionIdentity" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "appNamespace" TEXT NOT NULL,
    "providerActorId" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionCase" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "customerId" UUID,
    "kind" TEXT NOT NULL,
    "providerThreadOrEventId" TEXT NOT NULL,
    "sourceRef" JSONB NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastInboundKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigneeId" UUID,
    "sentiment" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionItem" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "parentId" TEXT,
    "direction" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRef" JSONB NOT NULL,
    "text" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InteractionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionTag" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionCustomerTag" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'customer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionCustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionCaseTag" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'case',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionCaseTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadReceipt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "lastReadKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionSyncState" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "cursor" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'not_synced',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "diagnosticId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionSendAttempt" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "targetHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerId" TEXT,
    "diagnosticId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionSendAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionAudit" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InteractionConnection_workspaceId_id_key" ON "InteractionConnection"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionAsset_workspaceId_id_key" ON "InteractionAsset"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionAsset_workspaceId_canonicalKey_key" ON "InteractionAsset"("workspaceId", "canonicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCustomer_workspaceId_id_key" ON "InteractionCustomer"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "InteractionIdentity_workspaceId_displayName_idx" ON "InteractionIdentity"("workspaceId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionIdentity_workspaceId_id_key" ON "InteractionIdentity"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_identity_scope_key" ON "InteractionIdentity"("workspaceId", "platform", "appNamespace", "assetId", "providerActorId");

-- CreateIndex
CREATE INDEX "InteractionCase_workspaceId_assetId_kind_lastInboundAt_id_idx" ON "InteractionCase"("workspaceId", "assetId", "kind", "lastInboundAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCase_workspaceId_id_key" ON "InteractionCase"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCase_workspaceId_assetId_id_key" ON "InteractionCase"("workspaceId", "assetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_case_source_key" ON "InteractionCase"("workspaceId", "assetId", "kind", "providerThreadOrEventId");

-- CreateIndex
CREATE INDEX "InteractionItem_receivedAt_idx" ON "InteractionItem"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionItem_workspaceId_id_key" ON "InteractionItem"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionItem_workspaceId_assetId_providerEventId_key" ON "InteractionItem"("workspaceId", "assetId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionTag_workspaceId_id_key" ON "InteractionTag"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionTag_workspaceId_id_kind_key" ON "InteractionTag"("workspaceId", "id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCustomerTag_workspaceId_id_key" ON "InteractionCustomerTag"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCustomerTag_customerId_tagId_key" ON "InteractionCustomerTag"("customerId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCaseTag_workspaceId_id_key" ON "InteractionCaseTag"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCaseTag_caseId_tagId_key" ON "InteractionCaseTag"("caseId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerNote_workspaceId_id_key" ON "CustomerNote"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReadReceipt_workspaceId_id_key" ON "ReadReceipt"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ReadReceipt_caseId_userId_key" ON "ReadReceipt"("caseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionSyncState_workspaceId_id_key" ON "InteractionSyncState"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionSyncState_assetId_kind_key" ON "InteractionSyncState"("assetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionSendAttempt_workspaceId_id_key" ON "InteractionSendAttempt"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionSendAttempt_assetId_requestKey_key" ON "InteractionSendAttempt"("assetId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionAudit_workspaceId_id_key" ON "InteractionAudit"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "InteractionConnection" ADD CONSTRAINT "InteractionConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionAsset" ADD CONSTRAINT "InteractionAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionAsset" ADD CONSTRAINT "InteractionAsset_workspaceId_connectionId_fkey" FOREIGN KEY ("workspaceId", "connectionId") REFERENCES "InteractionConnection"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCustomer" ADD CONSTRAINT "InteractionCustomer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionIdentity" ADD CONSTRAINT "InteractionIdentity_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "InteractionAsset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionIdentity" ADD CONSTRAINT "InteractionIdentity_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "InteractionCustomer"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCase" ADD CONSTRAINT "InteractionCase_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "InteractionAsset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCase" ADD CONSTRAINT "InteractionCase_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "InteractionCustomer"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionItem" ADD CONSTRAINT "InteractionItem_workspaceId_assetId_caseId_fkey" FOREIGN KEY ("workspaceId", "assetId", "caseId") REFERENCES "InteractionCase"("workspaceId", "assetId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionTag" ADD CONSTRAINT "InteractionTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCustomerTag" ADD CONSTRAINT "InteractionCustomerTag_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "InteractionCustomer"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCustomerTag" ADD CONSTRAINT "InteractionCustomerTag_workspaceId_tagId_kind_fkey" FOREIGN KEY ("workspaceId", "tagId", "kind") REFERENCES "InteractionTag"("workspaceId", "id", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCaseTag" ADD CONSTRAINT "InteractionCaseTag_workspaceId_caseId_fkey" FOREIGN KEY ("workspaceId", "caseId") REFERENCES "InteractionCase"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCaseTag" ADD CONSTRAINT "InteractionCaseTag_workspaceId_tagId_kind_fkey" FOREIGN KEY ("workspaceId", "tagId", "kind") REFERENCES "InteractionTag"("workspaceId", "id", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_workspaceId_customerId_fkey" FOREIGN KEY ("workspaceId", "customerId") REFERENCES "InteractionCustomer"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadReceipt" ADD CONSTRAINT "ReadReceipt_workspaceId_caseId_fkey" FOREIGN KEY ("workspaceId", "caseId") REFERENCES "InteractionCase"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionSyncState" ADD CONSTRAINT "InteractionSyncState_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "InteractionAsset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionSendAttempt" ADD CONSTRAINT "InteractionSendAttempt_workspaceId_assetId_fkey" FOREIGN KEY ("workspaceId", "assetId") REFERENCES "InteractionAsset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionAudit" ADD CONSTRAINT "InteractionAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain and reference-only constraints; no old publishing tables are changed.
CREATE UNIQUE INDEX inbox_active_tag_name ON "InteractionTag" ("workspaceId","kind","normalizedName") WHERE "deletedAt" IS NULL;
ALTER TABLE "InteractionConnection" ADD CONSTRAINT inbox_connection_platform CHECK ("platform" IN ('instagram','youtube','tiktok','pinterest'));
ALTER TABLE "InteractionAsset" ADD CONSTRAINT inbox_asset_connection CHECK (("platform"='facebook' AND "facebookManagedPageId" IS NOT NULL AND "connectionId" IS NULL) OR ("platform" IN ('instagram','youtube','tiktok','pinterest') AND "facebookManagedPageId" IS NULL AND "connectionId" IS NOT NULL));
ALTER TABLE "InteractionItem" ADD CONSTRAINT inbox_fb_reference_only CHECK ("platform"<>'facebook' OR "text" IS NULL);
ALTER TABLE "InteractionItem" ADD CONSTRAINT inbox_item_direction CHECK ("direction" IN ('inbound','outbound'));
ALTER TABLE "InteractionCase" ADD CONSTRAINT inbox_case_kind CHECK ("kind" IN ('comments','messages','mentions'));
ALTER TABLE "InteractionCase" ADD CONSTRAINT inbox_case_status CHECK ("status" IN ('pending','in_progress','resolved'));
ALTER TABLE "InteractionCase" ADD CONSTRAINT inbox_sentiment CHECK ("sentiment" IS NULL OR "sentiment" IN ('positive','neutral','negative'));
ALTER TABLE "InteractionTag" ADD CONSTRAINT inbox_tag_kind CHECK ("kind" IN ('customer','case'));
ALTER TABLE "InteractionCustomerTag" ADD CONSTRAINT inbox_customer_tag_kind CHECK ("kind"='customer');
ALTER TABLE "InteractionCaseTag" ADD CONSTRAINT inbox_case_tag_kind CHECK ("kind"='case');
ALTER TABLE "InteractionIdentity" ADD CONSTRAINT inbox_identity_namespace CHECK (length("appNamespace") BETWEEN 1 AND 256 AND length("providerActorId") BETWEEN 1 AND 256);
