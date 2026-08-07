import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = readFileSync(new URL("../app/en/privacy/page.tsx", import.meta.url), "utf8");

test("English privacy policy includes platform, retention, deletion, and TikTok disclosures", () => {
  for (const platform of ["Facebook", "Instagram", "YouTube", "TikTok", "LinkedIn", "Pinterest", "X"]) {
    assert.match(policy, new RegExp(platform));
  }

  assert.match(policy, /user\.info\.basic/);
  assert.match(policy, /video\.publish/);
  assert.match(policy, /72 hours/);
  assert.match(policy, /not sell/);
  assert.match(policy, /outside Mainland China/);
});
