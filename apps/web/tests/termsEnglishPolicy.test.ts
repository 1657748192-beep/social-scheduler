import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const terms = readFileSync(new URL("../app/en/terms/page.tsx", import.meta.url), "utf8");

test("English terms define content responsibility and third-party limits", () => {
  assert.match(terms, /own or have the necessary rights/);
  assert.match(terms, /music/);
  assert.match(terms, /third-party platform/);
  assert.match(terms, /outside Mainland China/);
  assert.match(terms, /1657748192@qq\.com/);
});
