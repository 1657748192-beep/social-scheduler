-- Account removal must not erase the independent connection/asset provenance
-- while bounded customer-data cleanup is pending. Publishing schema is untouched.
ALTER TABLE "InstagramManagementConnection" DROP CONSTRAINT "InstagramManagementConnection_workspaceId_platform_provide_fkey";
ALTER TABLE "InstagramManagementConnection" ADD CONSTRAINT "InstagramManagementConnection_workspaceId_platform_provide_fkey"
FOREIGN KEY ("workspaceId", "platform", "providerAccountId")
REFERENCES "social_accounts"("workspace_id", "platform", "provider_account_id") ON DELETE NO ACTION ON UPDATE CASCADE;
