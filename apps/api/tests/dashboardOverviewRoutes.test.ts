import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";

process.env.DATABASE_URL ??= "postgresql://fixture:fixture@127.0.0.1:55999/fixture";
process.env.REDIS_URL ??= "redis://127.0.0.1:55998";
process.env.JWT_SECRET ??= "dashboard-route-fixture-only";
process.env.NODE_ENV = "test";

test("real overview route rejects unauthenticated, foreign and disabled memberships before statistics reads", async () => {
  const { prisma } = await import("../src/prisma");
  const { workspaceRoutes } = await import("../src/routes/workspaceRoutes");
  const { config } = await import("../src/config");
  const originals = { session: prisma.userSession.findFirst, member: prisma.workspaceMember.findFirst, count: prisma.schedule.count };
  let membershipStatus = "disabled";
  const app = express();
  app.use(workspaceRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.statusCode ?? 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/workspaces/w/dashboard-overview`;
  try {
    prisma.schedule.count = (async () => { assert.fail("unauthorized requests must never reach statistics"); }) as any;
    prisma.userSession.findFirst = (async () => ({ createdAt: new Date(), expiresAt: new Date(Date.now() + 60000), revokedAt: null })) as any;
    prisma.workspaceMember.findFirst = (async ({ where }: any) => {
      assert.deepEqual(where, { userId: "u", workspaceId: "w", status: "active" });
      return membershipStatus === "active" ? { role: "viewer", status: "active" } : null;
    }) as any;
    assert.equal((await fetch(url)).status, 401);
    const token = jwt.sign({ sub: "u", email: "fixture@example.invalid", sid: "session", jti: "id" }, config.JWT_SECRET, { expiresIn: "1h" });
    const options = { headers: { Authorization: `Bearer ${token}` } };
    assert.equal((await fetch(url, options)).status, 403);
    membershipStatus = "foreign";
    assert.equal((await fetch(url, options)).status, 403);
  } finally {
    prisma.userSession.findFirst = originals.session;
    prisma.workspaceMember.findFirst = originals.member;
    prisma.schedule.count = originals.count;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
