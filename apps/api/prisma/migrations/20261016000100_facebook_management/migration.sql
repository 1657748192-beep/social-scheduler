CREATE TABLE "facebook_management_connections" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userTokenEncrypted" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "directoryReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_management_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_managed_pages" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileUrl" TEXT,
    "avatarUrl" TEXT,
    "pageTokenEncrypted" TEXT,
    "tasks" TEXT[],
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "facebook_managed_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_managed_page_businesses" (
    "id" UUID NOT NULL,
    "managedPageId" UUID NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,

    CONSTRAINT "facebook_managed_page_businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_management_oauth_states" (
    "id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "connectionId" UUID,
    "connectionVersion" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "facebook_management_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_management_page_selections" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "pageId" TEXT NOT NULL,
    "managedPageId" UUID NOT NULL,

    CONSTRAINT "facebook_management_page_selections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_management_subscriptions" (
    "id" UUID NOT NULL,
    "appId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "fields" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "checkedAt" TIMESTAMP(3),
    "diagnosticId" TEXT,

    CONSTRAINT "facebook_management_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_interaction_events" (
    "id" UUID NOT NULL,
    "managedPageId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "diagnosticId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_interaction_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_interaction_comments" (
    "id" UUID NOT NULL,
    "managedPageId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentId" TEXT,
    "senderId" TEXT,
    "senderName" TEXT,
    "text" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_interaction_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_interaction_threads" (
    "id" UUID NOT NULL,
    "managedPageId" UUID NOT NULL,
    "participantId" TEXT NOT NULL,
    "providerId" TEXT,
    "participantName" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_interaction_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_interaction_messages" (
    "id" UUID NOT NULL,
    "managedPageId" UUID NOT NULL,
    "providerId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "text" TEXT,
    "isEcho" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_interaction_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_interaction_send_attempts" (
    "id" UUID NOT NULL,
    "managedPageId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerId" TEXT,
    "diagnosticId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_interaction_send_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "facebook_management_connections_workspaceId_status_idx" ON "facebook_management_connections"("workspaceId", "status");

CREATE INDEX "facebook_managed_pages_pageId_active_idx" ON "facebook_managed_pages"("pageId", "active");

CREATE UNIQUE INDEX "facebook_managed_pages_connectionId_pageId_key" ON "facebook_managed_pages"("connectionId", "pageId");

CREATE UNIQUE INDEX "facebook_managed_page_businesses_managedPageId_businessId_r_key" ON "facebook_managed_page_businesses"("managedPageId", "businessId", "relation");

CREATE UNIQUE INDEX "facebook_management_oauth_states_state_key" ON "facebook_management_oauth_states"("state");

CREATE INDEX "facebook_management_oauth_states_expiresAt_idx" ON "facebook_management_oauth_states"("expiresAt");

CREATE UNIQUE INDEX "facebook_management_page_selections_workspaceId_pageId_key" ON "facebook_management_page_selections"("workspaceId", "pageId");

CREATE UNIQUE INDEX "facebook_management_subscriptions_appId_pageId_key" ON "facebook_management_subscriptions"("appId", "pageId");

CREATE INDEX "facebook_interaction_events_status_availableAt_leaseUntil_idx" ON "facebook_interaction_events"("status", "availableAt", "leaseUntil");

CREATE INDEX "facebook_interaction_events_receivedAt_idx" ON "facebook_interaction_events"("receivedAt");

CREATE UNIQUE INDEX "facebook_interaction_events_managedPageId_eventKey_key" ON "facebook_interaction_events"("managedPageId", "eventKey");

CREATE INDEX "facebook_interaction_comments_managedPageId_postId_occurred_idx" ON "facebook_interaction_comments"("managedPageId", "postId", "occurredAt");

CREATE INDEX "facebook_interaction_comments_receivedAt_idx" ON "facebook_interaction_comments"("receivedAt");

CREATE UNIQUE INDEX "facebook_interaction_comments_managedPageId_providerId_key" ON "facebook_interaction_comments"("managedPageId", "providerId");

CREATE INDEX "facebook_interaction_threads_receivedAt_idx" ON "facebook_interaction_threads"("receivedAt");

CREATE UNIQUE INDEX "facebook_interaction_threads_managedPageId_participantId_key" ON "facebook_interaction_threads"("managedPageId", "participantId");

CREATE INDEX "facebook_interaction_messages_managedPageId_participantId_o_idx" ON "facebook_interaction_messages"("managedPageId", "participantId", "occurredAt");

CREATE INDEX "facebook_interaction_messages_receivedAt_idx" ON "facebook_interaction_messages"("receivedAt");

CREATE UNIQUE INDEX "facebook_interaction_messages_managedPageId_providerId_key" ON "facebook_interaction_messages"("managedPageId", "providerId");

CREATE INDEX "facebook_interaction_send_attempts_createdAt_idx" ON "facebook_interaction_send_attempts"("createdAt");

CREATE UNIQUE INDEX "facebook_interaction_send_attempts_managedPageId_requestKey_key" ON "facebook_interaction_send_attempts"("managedPageId", "requestKey");
