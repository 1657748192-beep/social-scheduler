import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const composer = readFileSync(new URL("../components/composer/ComposerForm.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/composer/PlatformEditor.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../components/composer/PostPreview.tsx", import.meta.url), "utf8");

test("composer enables Pinterest as a real publishing platform with board-backed settings", () => {
  assert.match(composer, /new Set<ComposerPlatform>\(\["instagram", "facebook", "youtube", "tiktok", "pinterest"\]\)/);
  assert.match(composer, /pinterest-boards/);
  assert.match(composer, /PinterestPinSettings/);
  assert.match(composer, /pinterestSettingsByAccount/);
});

test("Pinterest keeps the website link out of the description and uses it as the Pin destination", () => {
  assert.match(editor, /platform === "pinterest"/);
  assert.match(editor, /click this Pin/);
  assert.match(preview, /pinterestSettingsByAccount/);
  assert.match(preview, /pinterestPinTitle/);
});
