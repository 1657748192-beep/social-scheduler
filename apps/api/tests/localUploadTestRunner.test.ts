import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("test runner propagates success and failure of actual child tests", () => {
  const run = (name: string) => spawnSync(process.execPath, ["scripts/run-tests.cjs", `apps/api/tests/fixtures/localUploadRunner${name}.cjs`], { encoding: "utf8" });
  assert.equal(run("Pass").status, 0);
  const failed = run("Fail");
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  assert.match(failed.stdout + failed.stderr, /intentional runner failure/);
});

test("default discovery selects real API and Web tests but not runner fixtures", () => {
  const { discoverTests } = require("../../../scripts/run-tests.cjs");
  assert.equal(typeof discoverTests, "function");
  const selected: string[] = discoverTests();
  assert.ok(selected.includes("apps/api/tests/localUploadProtocol.test.ts"));
  assert.ok(selected.includes("apps/web/tests/localUploadProtocol.test.ts"));
  assert.ok(selected.every(file => !file.includes("fixtures/")));
});

test("runner rejects unsafe legacy integration URLs rather than trusting inherited configuration", () => {
  const { environment } = require("../../../scripts/run-tests.cjs");
  const env = { LOCAL_UPLOAD_TEST_DATABASE_URL: "postgresql://u:p@127.0.0.1:55436/upload_test",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused", REDIS_URL: "redis://127.0.0.1:1",
    FACEBOOK_TEST_DATABASE_URL: "postgresql://u:p@production.example.com/upload_test" };
  assert.throws(() => environment(true, false, env));
});
