import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardOverviewService } from "../src/services/dashboardOverviewService";

test("overview checks active workspace membership before any reads", async () => {
  const service = createDashboardOverviewService({
    db: new Proxy({}, { get() { assert.fail("must not query unauthorized workspace"); } }) as any,
    requireMembership: async () => { throw new Error("forbidden"); },
    previewUrl: () => null, draftRetentionHours: 72
  });
  await assert.rejects(service("u", "foreign"), /forbidden/);
});

test("overview counts uncapped workspace publications, pending schedules, own unexpired drafts and active accounts", async () => {
  const db = {
    schedule: {
      count: async ({ where }: any) => {
        assert.equal(where.workspaceId, "w");
        if (where.status === "published") return 124;
        assert.deepEqual(where.status, { in: ["scheduled", "locked"] });
        return 9;
      },
      findMany: async (query: any) => {
        assert.deepEqual(query.where, { workspaceId: "w", status: { in: ["scheduled", "locked"] } });
        assert.deepEqual(query.orderBy, [{ scheduledAt: "asc" }, { id: "asc" }]);
        assert.equal(query.take, 5);
        return [{ id: "s", scheduledAt: new Date("2026-10-08T03:00:00Z"), status: "locked", postVariant: {
          platform: "instagram", text: "Actual caption", post: { title: "Real title" },
          socialAccount: { displayName: "test-account" }, media: []
        } }];
      }
    },
    post: { count: async ({ where }: any) => {
      assert.deepEqual(where, { workspaceId: "w", authorId: "u", workflowStatus: "draft", updatedAt: { gte: new Date("2026-10-04T00:00:00Z") } });
      return 103;
    } },
    socialAccount: { count: async ({ where }: any) => {
      assert.deepEqual(where, { workspaceId: "w", status: "active", platform: { in: ["instagram", "facebook", "tiktok", "youtube", "pinterest"] } });
      return 4;
    } }
  };
  const service = createDashboardOverviewService({ db: db as any, requireMembership: async () => {}, previewUrl: () => null, draftRetentionHours: 72, now: () => new Date("2026-10-07T00:00:00Z") });
  assert.deepEqual(await service("u", "w"), {
    publishedCount: 124, pendingCount: 9, draftCount: 103, connectedCount: 4,
    fetchedAt: "2026-10-07T00:00:00.000Z",
    upcoming: [{ id: "s", scheduledAt: "2026-10-08T03:00:00.000Z", status: "locked", platform: "instagram", title: "Real title", text: "Actual caption", accountName: "test-account", thumbnailUrl: null }]
  });
});
