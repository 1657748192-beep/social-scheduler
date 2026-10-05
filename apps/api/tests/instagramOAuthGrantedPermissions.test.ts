import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.JWT_SECRET = "test-secret-not-for-production";
process.env.INSTAGRAM_CLIENT_ID = "test-client";
process.env.INSTAGRAM_CLIENT_SECRET = "test-client-secret";
process.env.NODE_ENV = "test";

test("Instagram OAuth without returned permissions rejects before replacing any account credential", async () => {
  const { prisma } = await import("../src/prisma");
  const { completeOAuth } = await import("../src/services/socialAccountService");
  const { HttpError } = await import("../src/utils/errors");
  const originalFetch = globalThis.fetch;
  const originalFind = prisma.oauthState.findUnique;
  const originalDelete = prisma.oauthState.delete;
  const originalTransaction = prisma.$transaction;
  let writes = 0;
  try {
    prisma.oauthState.findUnique = (async () => ({
      id: "state-id", state: "state", platform: "instagram", workspaceId: "workspace",
      redirectUri: "https://example.com/callback", expiresAt: new Date(Date.now() + 60000),
      scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments"],
      instagramEngagementSocialAccountId: null
    })) as typeof originalFind;
    prisma.oauthState.delete = (async () => ({})) as typeof originalDelete;
    prisma.$transaction = (async () => {
      writes++;
      throw new Error("Unverified permissions reached credential storage");
    }) as typeof originalTransaction;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/me")) {
        return Response.json({ id: "scoped-id", user_id: "ig-1", username: "test-account", account_type: "BUSINESS" });
      }
      return Response.json({ access_token: "fake-test-token", expires_in: 5184000, token_type: "Bearer" });
    };
    await assert.rejects(completeOAuth("instagram", "code", "state"),
      (error: unknown) => error instanceof HttpError && error.statusCode === 400 && /granted permissions/.test(error.message));
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    prisma.oauthState.findUnique = originalFind;
    prisma.oauthState.delete = originalDelete;
    prisma.$transaction = originalTransaction;
    await prisma.$disconnect();
  }
});
