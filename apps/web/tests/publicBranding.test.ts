import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicHomepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const englishPublicHomepage = readFileSync(new URL("../app/en/page.tsx", import.meta.url), "utf8");

test("uses Social Scheduler as the only public application name in both languages", () => {
  assert.match(publicHomepage, /title: "Social Scheduler \| 社交媒体内容排程与发布"/);
  assert.match(englishPublicHomepage, /title: "Social Scheduler \| Plan and publish social content"/);
  assert.doesNotMatch(publicHomepage, /BufferHelp Social Scheduler/);
  assert.doesNotMatch(publicHomepage, /by BufferHelp/);
  assert.doesNotMatch(englishPublicHomepage, /BufferHelp Social Scheduler/);
  assert.doesNotMatch(englishPublicHomepage, /by BufferHelp/);
});
