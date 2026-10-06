import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.TIKTOK_CLIENT_ID = "test-client";
process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
process.env.NODE_ENV = "test";

for (const analyticsScope of ["video.list", "user.info.stats"]) test(`real TikTok OAuth callback preserves publishing credentials when requesting ${analyticsScope}`, async () => {
  const { prisma } = await import("../src/prisma");
  const { completeOAuth } = await import("../src/services/socialAccountService");
  const originalFetch = globalThis.fetch;
  const originalFind = prisma.oauthState.findUnique;
  const originalTransaction = prisma.$transaction;
  let writes = 0;
  try {
    prisma.oauthState.findUnique = (async () => ({
      id: "state-id", state: "state", platform: "tiktok", workspaceId: "workspace",
      redirectUri: "https://example.com/callback", expiresAt: new Date(Date.now() + 60000),
      scopes: ["user.info.basic", "video.publish", analyticsScope], instagramEngagementSocialAccountId: null
    })) as typeof originalFind;
    prisma.$transaction = (async (work: (tx: unknown) => Promise<unknown>) => work({
      socialAccount: {
        findUnique: async (args: { where: unknown }) => {
          assert.deepEqual(args.where, { workspaceId_platform_providerAccountId: {
            workspaceId: "workspace", platform: "tiktok", providerAccountId: "creator"
          } });
          return { credential: { scopes: ["user.info.basic", "video.publish"] } };
        },
        upsert: async () => { writes++; throw new Error("unsafe credential write"); }
      }
    })) as typeof originalTransaction;
    globalThis.fetch = async (url) => String(url).includes("/user/info/")
      ? Response.json({ data: { user: { open_id: "creator", display_name: "test" } }, error: { code: "ok" } })
      : Response.json({ access_token: "test-token", refresh_token: "test-refresh", expires_in: 86400,
          scope: `user.info.basic,${analyticsScope}`, token_type: "Bearer" });
    await assert.rejects(completeOAuth("tiktok", "code", "state"), /publishing permissions were not retained/);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    prisma.oauthState.findUnique = originalFind;
    prisma.$transaction = originalTransaction;
    await prisma.$disconnect();
  }
});
