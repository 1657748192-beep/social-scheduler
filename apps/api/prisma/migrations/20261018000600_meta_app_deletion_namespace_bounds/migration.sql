-- PostgreSQL bounded regex repetition is limited to255, so length is checked
-- separately.005 is already applied in the isolated test database; do not rewrite it.
ALTER TABLE "MetaInboxAppDeletionRequest" DROP CONSTRAINT "meta_app_deletion_namespace";
ALTER TABLE "MetaInboxAppDeletionRequest" ADD CONSTRAINT "meta_app_deletion_namespace"
 CHECK (platform IN ('facebook','instagram') AND "appId" ~ '^[0-9]+$' AND length("appId") BETWEEN 1 AND 256);
