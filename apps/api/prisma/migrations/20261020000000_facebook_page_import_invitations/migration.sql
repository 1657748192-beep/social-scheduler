CREATE TABLE "FacebookPageImportInvitation" (
 "id" UUID NOT NULL, "workspaceId" UUID NOT NULL, "createdById" UUID NOT NULL,
 "note" TEXT NOT NULL DEFAULT '', "secretHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'awaiting_authorization',
 "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "authorizedAt" TIMESTAMP(3), "candidateExpiresAt" TIMESTAMP(3),
 "terminalAt" TIMESTAMP(3), "retentionExpiresAt" TIMESTAMP(3), "appId" TEXT NOT NULL,
 "authorizerSubjectHash" TEXT, "authorizationStartedAt" TIMESTAMP(3), "selectionHash" TEXT,
 "selectedPageIds" JSONB, "result" JSONB, "diagnosticId" TEXT, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "FacebookPageImportInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FacebookPageImportInvitation_secretHash_key" ON "FacebookPageImportInvitation"("secretHash");
CREATE INDEX "fb_import_owner_list" ON "FacebookPageImportInvitation"("workspaceId","createdById","createdAt","id");
CREATE INDEX "fb_import_expiry" ON "FacebookPageImportInvitation"("status","expiresAt","candidateExpiresAt");
CREATE INDEX "fb_import_subject" ON "FacebookPageImportInvitation"("appId","authorizerSubjectHash");
CREATE TABLE "FacebookPageImportCandidate" (
 "invitationId" UUID NOT NULL, "encryptedEnvelope" TEXT NOT NULL,
 CONSTRAINT "FacebookPageImportCandidate_pkey" PRIMARY KEY ("invitationId"),
 CONSTRAINT "FacebookPageImportCandidate_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "FacebookPageImportInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
