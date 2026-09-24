import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import { nextAuthorizationScanBatch } from "./boundedAuthorizationScan";

export async function scanDueSocialAccountIds(
  provider: "youtube" | "tiktok" | "facebook",
  where: Prisma.SocialAccountWhereInput,
  limit = 100
) {
  const { redis } = await import("../../redis");
  const key = `auth-refresh-cursor:${provider}`;
  return nextAuthorizationScanBatch({
    readCursor: () => redis.get(key),
    writeCursor: async (cursor) => {
      if (cursor) await redis.set(key, cursor);
      else await redis.del(key);
    },
    select: async (afterId, limit) => {
      const rows = await prisma.socialAccount.findMany({
        where: { ...where, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true },
        orderBy: { id: "asc" },
        take: limit
      });
      return rows.map((row) => row.id);
    },
    limit
  });
}
