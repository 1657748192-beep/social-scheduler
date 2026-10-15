import type { TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm,mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
const guard = require("../../../../scripts/local-upload-test-environment.cjs");
export const validateLocalUploadTestEnvironment: (env: NodeJS.ProcessEnv) => { databaseUrl: string; redisUrl: string } = guard.validateLocalUploadTestEnvironment;

export async function createLocalUploadFixture(t: TestContext) {
  const { databaseUrl, redisUrl } = validateLocalUploadTestEnvironment(process.env);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null });
  redis.on("error", () => {});
  const temporaryRoot = await mkdtemp(join(tmpdir(), "scheduler-chunk-test-"));
  const root=join(temporaryRoot,'uploads');await mkdir(root);
  const cleanupTasks:Array<()=>Promise<void>>=[];
  const actor = { userId: randomUUID(), workspaceId: randomUUID() };
  const prefix = `local-upload-test:${randomUUID()}`;
  let disposed = false;
  const dispose = async () => {
    if (disposed) return; disposed = true;
    let cleanupError:unknown;
    for(const task of cleanupTasks.reverse())try{await task();}catch(e){cleanupError??=e;}
    try {
      await db.workspace.deleteMany({ where: { id: actor.workspaceId } });
      await db.user.deleteMany({ where: { id: actor.userId } });
    } finally {
      await db.$disconnect();
      if (redis.status === "ready") {
        const keys = await redis.keys(`${prefix}:*`);
        if (keys.length) await redis.del(...keys);
      }
      redis.disconnect();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
    if(cleanupError)throw cleanupError;
  };
  t.after(dispose);
  await redis.connect(); await redis.ping();
  await db.user.create({ data: { id: actor.userId, email: `${actor.userId}@example.test`, name: "Upload tester", passwordHash: "test-only-not-a-login" } });
  await db.workspace.create({ data: { id: actor.workspaceId, ownerId: actor.userId, name: "Upload test", slug: actor.workspaceId } });
  await db.workspaceMember.create({ data: { ...actor, role: "owner", status: "active" } });
  return { db, redis, root, actor, prefix, now: () => new Date(), dispose,onDispose:(task:()=>Promise<void>)=>{cleanupTasks.push(task);} };
}
