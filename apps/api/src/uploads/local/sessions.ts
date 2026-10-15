import type { LocalUploadSession, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireWorkspacePublishingAccess } from "../../services/workspaceService";
import { HttpError } from "../../utils/errors";
import { MAX_RESERVED_BYTES, MIN_FREE_BYTES, PART_SIZE_BYTES, UPLOAD_TTL_MS, parseManifest,
  type Manifest, type SessionDeps, type UploadActor, type UploadState, type UploadView } from "./protocol";

export async function requireUploadWriteAccess(db: Pick<PrismaClient, "workspaceMember" | "user">, actor: UploadActor) {
  const member = await requireWorkspacePublishingAccess(actor.userId, actor.workspaceId, db);
  if (member.role === "viewer") throw new HttpError(403, "Viewers cannot upload media");
}

export function getUploadView(session: LocalUploadSession, receivedParts: number[]): UploadView {
  return { id: session.id, state: session.state as UploadState, totalBytes: session.sizeBytes,
    partSizeBytes: PART_SIZE_BYTES, receivedParts: [...receivedParts].sort((a, b) => a - b),
    expiresAt: session.expiresAt.toISOString(), assetId: session.mediaAssetId };
}

export async function getOwnedSession(deps: SessionDeps, actor: UploadActor, id: string): Promise<LocalUploadSession> {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "Upload session not found");
  const session = await deps.db.localUploadSession.findFirst({ where: { id, ...actor } });
  if (!session) throw new HttpError(404, "Upload session not found");
  await requireUploadWriteAccess(deps.db, actor);
  return session;
}

export async function initSession(deps: SessionDeps, actor: UploadActor, value: Manifest): Promise<UploadView> {
  const input = parseManifest(value);
  await requireUploadWriteAccess(deps.db, actor);
  return deps.db.$transaction(async tx => {
    // All initializers share this very short critical section, including quota
    // reads and idempotency lookup, so reservations cannot be oversold.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(742183005)`;
    await requireUploadWriteAccess(tx, actor);
    const existing = await tx.localUploadSession.findUnique({ where: { userId_workspaceId_clientKey: { ...actor, clientKey: input.clientKey } } });
    if (existing) {
      if (existing.fingerprint !== input.fingerprint || existing.originalName !== input.originalName) {
        throw new HttpError(409, "Upload key belongs to a different file", { code: "manifest_conflict" });
      }
      if (existing.expiresAt <= deps.now() || ["cancelled", "expired"].includes(existing.state)) {
        throw new HttpError(410, "Upload session has expired", { code: "upload_expired" });
      }
      const parts = await tx.localUploadPart.findMany({ where: { sessionId: existing.id }, select: { index: true } });
      return getUploadView(existing, parts.map(p => p.index));
    }
    const activeStates = ["receiving", "assembling"];
    const [userCount, workspaceCount, reserved] = await Promise.all([
      tx.localUploadSession.count({ where: { userId: actor.userId, state: { in: activeStates } } }),
      tx.localUploadSession.count({ where: { workspaceId: actor.workspaceId, state: { in: activeStates } } }),
      tx.localUploadSession.aggregate({ _sum: { reservedBytes: true } })
    ]);
    if (userCount >= 2 || workspaceCount >= 4) throw new HttpError(429, "未完成的上传较多，请先完成或取消已有任务", { code: "upload_quota" });
    const reservedBytes = 2 * input.sizeBytes + PART_SIZE_BYTES;
    const totalReserved = (reserved._sum.reservedBytes ?? 0) + reservedBytes;
    if (totalReserved > MAX_RESERVED_BYTES || await deps.availableBytes() < MIN_FREE_BYTES + BigInt(totalReserved)) {
      throw new HttpError(507, "服务器暂时没有足够的上传空间，请稍后重试", { code: "upload_capacity" });
    }
    const now = deps.now();
    const session = await tx.localUploadSession.create({ data: { ...actor, ...input, reservedBytes,
      activityAt: now, expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS) } });
    return getUploadView(session, []);
  }, { maxWait: 10000, timeout: 10000 });
}
