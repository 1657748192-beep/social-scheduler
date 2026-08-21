import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertPinterestAccountEnvironment,
  pinterestApiBaseUrl,
  pinterestOAuthTokenUrl,
  pinterestProfileUrl
} from "../src/integrations/social/pinterestEnvironment";

test("uses Pinterest production URLs by default contract", () => {
  assert.equal(pinterestApiBaseUrl("production"), "https://api.pinterest.com/v5");
  assert.equal(pinterestOAuthTokenUrl("production"), "https://api.pinterest.com/v5/oauth/token");
  assert.equal(pinterestProfileUrl("production"), "https://api.pinterest.com/v5/user_account");
});

test("uses Pinterest Sandbox URLs only for server-side v5 calls", () => {
  assert.equal(pinterestApiBaseUrl("sandbox"), "https://api-sandbox.pinterest.com/v5");
  assert.equal(pinterestOAuthTokenUrl("sandbox"), "https://api-sandbox.pinterest.com/v5/oauth/token");
  assert.equal(pinterestProfileUrl("sandbox"), "https://api-sandbox.pinterest.com/v5/user_account");
});

test("refuses a Pinterest token connected for another environment", () => {
  assert.throws(
    () => assertPinterestAccountEnvironment({ pinterestApiEnvironment: "production" }, "sandbox"),
    /Reconnect the Pinterest account/
  );
});

test("refuses a Pinterest token without an environment marker", () => {
  assert.throws(
    () => assertPinterestAccountEnvironment({}, "production"),
    /Reconnect the Pinterest account/
  );
});

test("registers a manager-protected route for creating Pinterest test boards", async () => {
  const routes = await readFile(new URL("../src/routes/socialAccountRoutes.ts", import.meta.url), "utf8");
  assert.match(routes, /pinterest-boards[\s\S]*?requireAuth[\s\S]*?createPinterestBoardController/);
});
