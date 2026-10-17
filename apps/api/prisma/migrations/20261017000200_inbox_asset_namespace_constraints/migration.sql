-- Bind denormalized identity/platform to the same canonical asset.
-- Only new interaction-domain tables are altered.
ALTER TABLE "InteractionAsset" ADD CONSTRAINT inbox_asset_platform_key UNIQUE ("workspaceId","id","platform");
ALTER TABLE "InteractionAsset" ADD CONSTRAINT inbox_asset_namespace_key UNIQUE ("workspaceId","id","platform","appNamespace");
ALTER TABLE "InteractionItem" ADD CONSTRAINT inbox_item_asset_platform FOREIGN KEY ("workspaceId","assetId","platform") REFERENCES "InteractionAsset" ("workspaceId","id","platform") ON DELETE CASCADE;
ALTER TABLE "InteractionIdentity" ADD CONSTRAINT inbox_identity_asset_namespace FOREIGN KEY ("workspaceId","assetId","platform","appNamespace") REFERENCES "InteractionAsset" ("workspaceId","id","platform","appNamespace") ON DELETE CASCADE;
