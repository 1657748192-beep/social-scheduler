import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createLocalUploadFixture } from "./helpers/localUploadFixture";
import { computeFingerprint } from "../src/uploads/local/protocol";
import * as sessions from "../src/uploads/local/sessions";

const service = sessions as any;
async function manifest(sizeBytes = 1048577) {
  const partHashes = Array(Math.ceil(sizeBytes / 1048576)).fill("a".repeat(64));
  return { clientKey: randomUUID(), originalName: "original.mp4", mimeType: "video/mp4", sizeBytes, partHashes,
    fingerprint: await computeFingerprint(sizeBytes, "video/mp4", partHashes) };
}
const status = (code: number) => (error: any) => error.statusCode === code;

test("initialization is idempotent, private and preserves unrelated schedules and grants", async t => {
  assert.equal(typeof service.initSession, "function");
  const f = await createLocalUploadFixture(t);
  const deps = { db: f.db, now: f.now, availableBytes: async () => 10n * 1024n ** 3n };
  const input = await manifest();
  const before = [await f.db.schedule.count(), await f.db.oauthCredential.count()];
  const [a, b] = await Promise.all([service.initSession(deps, f.actor, input), service.initSession(deps, f.actor, input)]);
  assert.equal(a.id, b.id);
  assert.equal(await (f.db as any).localUploadSession.count({ where: { userId: f.actor.userId } }), 1);
  await assert.rejects(service.initSession(deps, f.actor, { ...input, originalName: "changed.mp4" }), status(409));
  await assert.rejects(service.getOwnedSession(deps, { ...f.actor, userId: randomUUID() }, a.id), status(404));
  await assert.rejects(service.getOwnedSession(deps, { ...f.actor, workspaceId: randomUUID() }, a.id), status(404));
  await assert.rejects(service.getOwnedSession(deps, f.actor, "../bad"), status(404));
  assert.deepEqual([await f.db.schedule.count(), await f.db.oauthCredential.count()], before);
  const row = await service.getOwnedSession(deps, f.actor, a.id);
  assert.equal(row.reservedBytes, 3145730);
  assert.equal(new Date(a.expiresAt).getTime() - row.activityAt.getTime(), 86400000);
});

test("viewer, disabled and expired access cannot create or continue an upload", async t => {
  assert.equal(typeof service.initSession, "function");
  const f = await createLocalUploadFixture(t);
  const deps = { db: f.db, now: f.now, availableBytes: async () => 10n * 1024n ** 3n };
  const a = await service.initSession(deps, f.actor, await manifest());
  await f.db.workspaceMember.updateMany({ where: f.actor, data: { role: "viewer" } });
  await assert.rejects(service.initSession(deps, f.actor, await manifest()), status(403));
  await assert.rejects(service.getOwnedSession(deps, f.actor, a.id), status(403));
  await f.db.workspaceMember.updateMany({ where: f.actor, data: { role: "owner" } });
  await f.db.user.update({ where: { id: f.actor.userId }, data: { publishingAccessDisabled: true } });
  await assert.rejects(service.getOwnedSession(deps, f.actor, a.id), status(403));
  await f.db.user.update({ where: { id: f.actor.userId }, data: { publishingAccessDisabled: false, publishingAccessExpiresAt: new Date(0) } });
  await assert.rejects(service.initSession(deps, f.actor, await manifest()), status(403));
});

test("per-user and workspace quotas reject only new sessions, and disk pressure cannot reserve", async t => {
  assert.equal(typeof service.initSession, "function");
  const f = await createLocalUploadFixture(t);
  const deps = { db: f.db, now: f.now, availableBytes: async () => 10n * 1024n ** 3n };
  const first = await manifest();
  await service.initSession(deps, f.actor, first);
  await service.initSession(deps, f.actor, await manifest());
  assert.equal((await service.initSession(deps, f.actor, first)).state, "receiving");
  await assert.rejects(service.initSession(deps, f.actor, await manifest()), status(429));
  const extraUsers: string[] = [];
  t.after(async () => { await f.db.user.deleteMany({ where: { id: { in: extraUsers } } }); });
  for (let i = 0; i < 2; i++) {
    const userId = randomUUID(); extraUsers.push(userId);
    await f.db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "Extra", passwordHash: "test-only" } });
    await f.db.workspaceMember.create({ data: { workspaceId: f.actor.workspaceId, userId, role: "editor", status: "active" } });
    const actor = { ...f.actor, userId };
    if (i === 0) {
      await service.initSession(deps, actor, await manifest()); await service.initSession(deps, actor, await manifest());
    } else await assert.rejects(service.initSession(deps, actor, await manifest()), status(429));
  }
  const g = await createLocalUploadFixture(t);
  await assert.rejects(service.initSession({ ...deps, availableBytes: async () => 2147483648n }, g.actor, await manifest()), status(507));
  assert.equal(await (g.db as any).localUploadSession.count({ where: { userId: g.actor.userId } }), 0);
});

test("concurrent large reservations never exceed the global two GiB cap", async t => {
  assert.equal(typeof service.initSession, "function");
  const fixtures = await Promise.all(Array.from({ length: 5 }, () => createLocalUploadFixture(t)));
  const results = await Promise.allSettled(fixtures.map(async f => service.initSession(
    { db: f.db, now: f.now, availableBytes: async () => 10n * 1024n ** 3n }, f.actor, await manifest(262144000))));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 4);
  const sum = await (fixtures[0].db as any).localUploadSession.aggregate({ _sum: { reservedBytes: true } });
  assert.ok(sum._sum.reservedBytes <= 2147483648);
});
