import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("stores the provider account identity only for Instagram variants", async () => {
  const { instagramProviderAccountSnapshot, instagramAccountLinkState } = await import("../src/services/instagramPostAccountIdentity");

  assert.equal(instagramProviderAccountSnapshot("instagram", "ig-professional-42"), "ig-professional-42");
  assert.equal(instagramProviderAccountSnapshot("facebook", "fb-page-42"), null);
  assert.equal(instagramProviderAccountSnapshot("instagram", null), null);
  assert.equal(instagramAccountLinkState("ig-professional-42", "ig-professional-42"), "connected");
  assert.equal(instagramAccountLinkState("ig-professional-42", "ig-another-account"), "reconnect");
  assert.equal(instagramAccountLinkState("ig-professional-42", null), "reconnect");
  assert.equal(instagramAccountLinkState(null, null), "legacy_unverified");
  assert.equal(instagramAccountLinkState(null, "ig-professional-42"), "connected");
});

test("migration backfills linked Instagram variants and leaves non-Instagram and orphan variants empty", () => {
  const migration = readFileSync(new URL(
    "../prisma/migrations/20261004020000_instagram_post_account_identity/migration.sql",
    import.meta.url
  ), "utf8");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE social_accounts (id TEXT PRIMARY KEY, platform TEXT NOT NULL, provider_account_id TEXT NOT NULL);
      CREATE TABLE post_variants (id TEXT PRIMARY KEY, platform TEXT NOT NULL, social_account_id TEXT);
      INSERT INTO social_accounts VALUES ('ig-account', 'instagram', 'ig-professional-42');
      INSERT INTO social_accounts VALUES ('fb-account', 'facebook', 'fb-page-42');
      INSERT INTO post_variants VALUES ('ig-linked', 'instagram', 'ig-account');
      INSERT INTO post_variants VALUES ('fb-linked', 'facebook', 'fb-account');
      INSERT INTO post_variants VALUES ('ig-orphan', 'instagram', NULL);
    `);
    db.exec(migration);

    const rows = db.prepare("SELECT id, instagram_provider_account_id FROM post_variants ORDER BY id").all()
      .map((row) => Object.fromEntries(Object.entries(row)));
    assert.deepEqual(rows, [
      { id: "fb-linked", instagram_provider_account_id: null },
      { id: "ig-linked", instagram_provider_account_id: "ig-professional-42" },
      { id: "ig-orphan", instagram_provider_account_id: null }
    ]);
  } finally {
    db.close();
  }
});
