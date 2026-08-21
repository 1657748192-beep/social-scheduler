import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  buildPinterestCreateBoardBody,
  buildPinterestCreatePinBody,
  getPinterestPinValidationError,
  pinterestPinPermalink,
  readPinterestPinSettings
} from "../src/integrations/social/pinterestPublishing";

test("builds a public Pinterest board creation request", () => {
  assert.deepEqual(buildPinterestCreateBoardBody("Sandbox recording board"), {
    name: "Sandbox recording board",
    privacy: "PUBLIC"
  });
});

const completeSettings = {
  boardId: "board-123",
  boardName: "Summer products",
  title: "Rose facial oil",
  link: "https://example.com/rose-oil"
};

const imageMedia = [{ mimeType: "image/jpeg", fileUrl: "https://app.bufferhelp.com/uploads/rose.jpg" }];

test("reads trimmed Pinterest Pin settings without unrelated payload fields", () => {
  assert.deepEqual(
    readPinterestPinSettings({
      boardId: " board-123 ",
      boardName: " Summer products ",
      title: " Rose facial oil ",
      link: " https://example.com/rose-oil ",
      ignored: "do not persist"
    }),
    completeSettings
  );
});

test("requires a board and a title for a Pinterest Pin", () => {
  assert.equal(
    getPinterestPinValidationError({ title: "Rose facial oil" }, imageMedia, "Short description"),
    "Choose a Pinterest board before publishing."
  );
  assert.equal(
    getPinterestPinValidationError({ boardId: "board-123" }, imageMedia, "Short description"),
    "Enter a Pinterest Pin title before publishing."
  );
});

test("requires exactly one image and rejects non-image media", () => {
  assert.equal(
    getPinterestPinValidationError(completeSettings, [], "Short description"),
    "Pinterest publishing requires exactly one image."
  );
  assert.equal(
    getPinterestPinValidationError(
      completeSettings,
      [{ mimeType: "video/mp4", fileUrl: "https://app.bufferhelp.com/uploads/video.mp4" }],
      "Short description"
    ),
    "Pinterest image Pins do not support video media yet."
  );
  assert.equal(
    getPinterestPinValidationError(completeSettings, [...imageMedia, ...imageMedia], "Short description"),
    "Pinterest publishing requires exactly one image."
  );
});

test("validates Pinterest title, description, and link limits", () => {
  assert.equal(
    getPinterestPinValidationError({ ...completeSettings, title: "x".repeat(101) }, imageMedia, "Short description"),
    "Pinterest Pin titles can contain at most 100 characters."
  );
  assert.equal(
    getPinterestPinValidationError(completeSettings, imageMedia, "x".repeat(801)),
    "Pinterest descriptions can contain at most 800 characters."
  );
  assert.equal(
    getPinterestPinValidationError({ ...completeSettings, link: "not-a-url" }, imageMedia, "Short description"),
    "Pinterest website links must be valid http or https URLs."
  );
  assert.equal(
    getPinterestPinValidationError({ ...completeSettings, link: "" }, imageMedia, "Short description"),
    null
  );
});

test("builds an image_url Pinterest request without placing the link in the description", () => {
  assert.deepEqual(
    buildPinterestCreatePinBody(completeSettings, "Short description", imageMedia[0].fileUrl),
    {
      board_id: "board-123",
      title: "Rose facial oil",
      description: "Short description",
      link: "https://example.com/rose-oil",
      media_source: {
        source_type: "image_url",
        url: "https://app.bufferhelp.com/uploads/rose.jpg",
        is_standard: true
      }
    }
  );
  assert.equal(pinterestPinPermalink("pin-123"), "https://www.pinterest.com/pin/pin-123/");
});

test("validates Pinterest publishing requests against ready workspace media before queueing", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const service = await readFile(path.join(root, "src/services/composerService.ts"), "utf8");

  assert.match(service, /getReadyWorkspaceMediaById/);
  assert.match(service, /getPinterestPinValidationError/);
  assert.match(service, /assertPinterestPublishSettings\(input\.variants, mediaById\)/);
  assert.match(service, /status:\s*"ready"/);
});
