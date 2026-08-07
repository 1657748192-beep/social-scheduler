import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chrome = readFileSync(new URL("../components/public/PublicSiteChrome.tsx", import.meta.url), "utf8");

test("public chrome maps both languages to stable counterparts", () => {
  assert.match(chrome, /"zh-CN": \{ home: "\/", privacy: "\/privacy", terms: "\/terms" \}/);
  assert.match(chrome, /"en": \{ home: "\/en", privacy: "\/en\/privacy", terms: "\/en\/terms" \}/);
  assert.match(chrome, /中文/);
  assert.match(chrome, /English/);
  assert.match(chrome, /href={publicPaths\["zh-CN"\]\[page\]}/);
  assert.match(chrome, /href={publicPaths\.en\[page\]}/);
  assert.match(chrome, /<Link href={paths\.privacy}>{copy\.privacy}<\/Link>/);
  assert.match(chrome, /<Link href={paths\.terms}>{copy\.terms}<\/Link>/);
});
