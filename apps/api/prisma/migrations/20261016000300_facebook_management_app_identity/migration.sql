-- New management tables only; no copying or migration of publishing credentials.
-- These tables are not exposed before the feature is enabled. Reject migration
-- if there are unexpected identity-less grants instead of guessing an app ID.
ALTER TABLE "facebook_management_connections" ADD COLUMN "appId" TEXT NOT NULL;
ALTER TABLE "facebook_management_oauth_states" ADD COLUMN "appId" TEXT NOT NULL;
