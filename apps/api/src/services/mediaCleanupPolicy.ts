export type LinkedMediaCleanupCandidate = {
  variantLinks: Array<{
    postVariant: {
      publishStatus: string;
      schedules: Array<{
        status: string;
        updatedAt: Date;
      }>;
    };
  }>;
};

const finalScheduleStatuses = new Set(["published", "failed", "canceled"]);
const finalVariantStatuses = new Set(["published", "failed", "canceled"]);

export function isLinkedMediaReadyForCleanup(
  asset: LinkedMediaCleanupCandidate,
  now: number,
  publishedRetentionMs: number,
  failedRetentionMs: number
) {
  const expiryTimes: number[] = [];

  for (const link of asset.variantLinks) {
    const variant = link.postVariant;

    if (!finalVariantStatuses.has(variant.publishStatus)) {
      return false;
    }

    if (!variant.schedules.length || variant.schedules.some((schedule) => !finalScheduleStatuses.has(schedule.status))) {
      return false;
    }

    const finalTime = Math.max(...variant.schedules.map((schedule) => schedule.updatedAt.getTime()));
    const retentionMs = variant.publishStatus === "published" ? publishedRetentionMs : failedRetentionMs;
    expiryTimes.push(finalTime + retentionMs);
  }

  return expiryTimes.length > 0 && Math.max(...expiryTimes) <= now;
}
