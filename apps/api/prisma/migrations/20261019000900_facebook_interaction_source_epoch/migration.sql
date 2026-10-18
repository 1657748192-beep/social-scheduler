-- Unknown historical provenance remains NULL; never relabel it as a fresh grant.
ALTER TABLE "facebook_interaction_events" ADD COLUMN "connectionVersion" INTEGER CHECK ("connectionVersion" > 0);
ALTER TABLE "facebook_interaction_comments" ADD COLUMN "connectionVersion" INTEGER CHECK ("connectionVersion" > 0);
ALTER TABLE "facebook_interaction_threads" ADD COLUMN "connectionVersion" INTEGER CHECK ("connectionVersion" > 0);
ALTER TABLE "facebook_interaction_messages" ADD COLUMN "connectionVersion" INTEGER CHECK ("connectionVersion" > 0);
ALTER TABLE "facebook_interaction_send_attempts" ADD COLUMN "connectionVersion" INTEGER CHECK ("connectionVersion" > 0);
