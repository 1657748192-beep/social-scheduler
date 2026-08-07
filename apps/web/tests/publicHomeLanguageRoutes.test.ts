import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const englishHome = readFileSync(new URL("../app/en/page.tsx", import.meta.url), "utf8");
const homeContent = readFileSync(new URL("../components/public/PublicHomeContent.tsx", import.meta.url), "utf8");

test("English home is direct and defines the TikTok availability boundary", () => {
  assert.match(englishHome, /locale="en"/);
  assert.match(homeContent, /outside Mainland China/);
  assert.match(homeContent, /Social Scheduler/);
});
