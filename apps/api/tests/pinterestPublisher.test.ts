import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  describePinterestApiError,
  loadPinterestBoardPages
} from "../src/integrations/social/pinterestPublishing";

test("loads every Pinterest board page until the API stops returning a bookmark", async () => {
  const receivedBookmarks: Array<string | undefined> = [];
  const boards = await loadPinterestBoardPages(async (bookmark) => {
    receivedBookmarks.push(bookmark);
    if (!bookmark) {
      return {
        items: [{ id: "board-1", name: "Products", privacy: "PUBLIC" }],
        bookmark: "next-page"
      };
    }

    return {
      items: [{ id: "board-2", name: "Ideas", description: "Inspiration" }]
    };
  });

  assert.deepEqual(receivedBookmarks, [undefined, "next-page"]);
  assert.deepEqual(boards, [
    { id: "board-1", name: "Products", privacy: "PUBLIC" },
    { id: "board-2", name: "Ideas", description: "Inspiration" }
  ]);
});

test("stops Pinterest board pagination after the documented safety cap", async () => {
  let calls = 0;
  const boards = await loadPinterestBoardPages(async () => {
    calls += 1;
    return {
      items: [{ id: `board-${calls}`, name: `Board ${calls}` }],
      bookmark: `bookmark-${calls}`
    };
  });

  assert.equal(calls, 20);
  assert.equal(boards.length, 20);
});

test("uses Pinterest's useful API error data without exposing raw response objects", () => {
  assert.equal(
    describePinterestApiError({ code: 31, message: "Board not found" }, "Pinterest request failed"),
    "Pinterest error 31: Board not found"
  );
  assert.equal(describePinterestApiError({}, "Pinterest request failed"), "Pinterest request failed");
});

test("exposes Pinterest board lookup only through the authenticated workspace account route", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const [service, controller, routes] = await Promise.all([
    readFile(path.join(root, "src/services/socialAccountService.ts"), "utf8"),
    readFile(path.join(root, "src/controllers/socialAccountController.ts"), "utf8"),
    readFile(path.join(root, "src/routes/socialAccountRoutes.ts"), "utf8")
  ]);

  assert.match(service, /export async function getPinterestBoards/);
  assert.match(service, /requireWorkspaceMembership\(userId, workspaceId\)/);
  assert.match(service, /PinterestPublisher\(\)\.listBoards\(workspaceId, socialAccountId\)/);
  assert.match(controller, /getPinterestBoardsController/);
  assert.match(routes, /pinterest-boards/);
  assert.match(routes, /requireAuth/);
});
