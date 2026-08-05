import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privacyPolicy = readFileSync(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");

test("discloses data use for every supported social platform", () => {
  assert.match(privacyPolicy, /第三方平台授权信息与用途/);

  for (const platform of ["Facebook", "Instagram", "YouTube", "TikTok", "LinkedIn", "Pinterest", "X"]) {
    assert.match(privacyPolicy, new RegExp(platform));
  }
});
