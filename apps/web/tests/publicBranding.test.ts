import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicHomepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("uses Social Scheduler as the only public application name", () => {
  assert.match(publicHomepage, /title: "Social Scheduler \| Plan and publish social content"/);
  assert.doesNotMatch(publicHomepage, /BufferHelp Social Scheduler/);
  assert.doesNotMatch(publicHomepage, /by BufferHelp/);
});
