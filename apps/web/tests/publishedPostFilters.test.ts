import assert from "node:assert/strict";
import test from "node:test";
import { filterPublishedPosts, getPlatformAccounts } from "../lib/publishedPostFilters";

const posts = [
  { id: "ig-a", platform: "instagram", socialAccount: { id: "a" } },
  { id: "ig-b", platform: "instagram", socialAccount: { id: "b" } },
  { id: "tt-a", platform: "tiktok", socialAccount: { id: "a" } },
  { id: "removed", platform: "instagram", socialAccount: null },
  { id: "legacy", platform: "linkedin", socialAccount: null }
];
test("platform and account filters intersect by account ID, not display name", () => {
  assert.deepEqual(filterPublishedPosts(posts, "instagram", "a").map(p => p.id), ["ig-a"]);
  assert.deepEqual(filterPublishedPosts(posts, "instagram", "b").map(p => p.id), ["ig-b"]);
});
test("all accounts retains removed-account history without deleting unsupported history", () => {
  assert.deepEqual(filterPublishedPosts(posts, "instagram", "all").map(p => p.id), ["ig-a", "ig-b", "removed"]);
  assert.equal(filterPublishedPosts(posts, "all", "all").length, 5);
});
test("unknown account produces no matching posts", () => {
  assert.deepEqual(filterPublishedPosts(posts, "instagram", "missing"), []);
});
test("account choices include bound accounts without posts but exclude other platforms and disconnected records", () => {
  const accounts = [
    { id: "a", platform: "instagram", status: "active" },
    { id: "b", platform: "instagram", status: "token_expired" },
    { id: "c", platform: "instagram", status: "disconnected" },
    { id: "d", platform: "tiktok", status: "active" }
  ];
  assert.deepEqual(getPlatformAccounts(accounts, "instagram").map(a => a.id), ["a", "b"]);
  assert.deepEqual(getPlatformAccounts(accounts, "all"), []);
});
