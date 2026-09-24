import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("server deployment applies Prisma migrations before starting the new Worker", () => {
  const script = readFileSync("../../scripts/deploy-server.sh", "utf8");
  const migrateAt = script.indexOf("compose run --rm --no-deps api npx prisma migrate deploy");
  const startAt = script.indexOf("compose up -d postgres redis api worker web reverse-proxy");
  assert.ok(migrateAt > 0);
  assert.ok(startAt > migrateAt);
});
