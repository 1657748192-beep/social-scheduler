import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { getSocialPublisher } from "./integrations/social/registry";
import { prisma } from "./prisma";
import { redis, redisConnection } from "./redis";
import { publishQueueJobName, publishQueueName, type PublishQueuePayload } from "./queues/publishQueue";
import { config } from "./config";
import { cleanUpExpiredMedia, withResolvedMediaUrl } from "./services/mediaStorageService";
import { cleanUpExpiredDrafts } from "./services/composerService";
import { recoverPendingPublishJobs, repairSimulatedInstagramPublishJobs } from "./services/scheduleService";
import { refreshDuePinterestAccounts } from "./integrations/social/pinterestCredentialService";
import { refreshDueInstagramAccounts } from "./integrations/social/instagramCredentialService";
import { refreshDueYouTubeAccounts } from "./integrations/social/youtubeCredentialService";
import { refreshDueTikTokAccounts } from "./integrations/social/tiktokCredentialService";
import { checkDueFacebookPages } from "./integrations/social/facebookPageCredentialService";
import { authorizationRefreshIntervalsMs, runAuthorizationChecks, type AuthorizationProvider } from "./integrations/social/authorizationRefreshWorker";
import { hasRemainingPublishAttempts, persistConfirmedPublishResult } from "./integrations/social/publishOutcomeError";

const retryableJobStatuses = ["waiting", "retrying"] as const;
const runnableScheduleStatuses = ["scheduled", "locked"] as const;

const worker = new Worker<PublishQueuePayload, unknown, typeof publishQueueJobName>(
  publishQueueName,
  async (job) => {
    const publishJob = await prisma.publishJob.findUnique({
      where: { id: job.data.publishJobId },
      include: {
        schedule: {
          include: {
            postVariant: {
              include: {
                media: {
                  include: {
                    mediaAsset: true
                  },
                  orderBy: {
                    sortOrder: "asc"
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!publishJob) {
      throw new Error(`Publish job not found: ${job.data.publishJobId}`);
    }

    if (publishJob.status === "succeeded") {
      return { skipped: true, reason: "already_succeeded" };
    }

    if (!retryableJobStatuses.includes(publishJob.status as (typeof retryableJobStatuses)[number])) {
      return { skipped: true, reason: `job_status_${publishJob.status}` };
    }

    if (!runnableScheduleStatuses.includes(publishJob.schedule.status as (typeof runnableScheduleStatuses)[number])) {
      return { skipped: true, reason: `schedule_status_${publishJob.schedule.status}` };
    }

    const creator = await prisma.user.findUnique({
      where: { id: publishJob.schedule.createdBy },
      select: {
        publishingAccessDisabled: true,
        publishingAccessExpiresAt: true
      }
    });

    if (
      !creator ||
      creator.publishingAccessDisabled ||
      (creator.publishingAccessExpiresAt && creator.publishingAccessExpiresAt.getTime() <= Date.now())
    ) {
      await prisma.$transaction([
        prisma.publishJob.update({
          where: { id: publishJob.id },
          data: {
            status: "failed",
            lastError: "创建人的会员发布权限已停用或到期，此排程未发布。"
          }
        }),
        prisma.schedule.update({
          where: { id: publishJob.scheduleId },
          data: { status: "failed" }
        }),
        prisma.postVariant.update({
          where: { id: publishJob.postVariantId },
          data: { publishStatus: "failed" }
        })
      ]);

      return { skipped: true, reason: "test_access_expired" };
    }

    await prisma.$transaction([
      prisma.publishJob.update({
        where: { id: publishJob.id },
        data: {
          status: "active",
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lastError: null
        }
      }),
      prisma.schedule.update({
        where: { id: publishJob.scheduleId },
        data: {
          status: "locked"
        }
      }),
      prisma.postVariant.update({
        where: { id: publishJob.postVariantId },
        data: {
          publishStatus: "publishing"
        }
      })
    ]);

    const socialAccountId = publishJob.schedule.postVariant.socialAccountId;

    if (!socialAccountId) {
      throw new Error(
        "This scheduled post has no target social account. Edit the post and select the account before publishing."
      );
    }

    const publisher = getSocialPublisher(publishJob.schedule.postVariant.platform);
    const publishResult = await publisher.publish({
      workspaceId: publishJob.workspaceId,
      socialAccountId,
      platform: publishJob.schedule.postVariant.platform,
      text: publishJob.schedule.postVariant.text,
      platformPayload: publishJob.schedule.postVariant.platformPayload,
      media: publishJob.schedule.postVariant.media.map((item) => {
        const asset = withResolvedMediaUrl(item.mediaAsset, "publish");
        return {
          id: asset.id,
          fileUrl: asset.fileUrl,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes
        };
      }),
      idempotencyKey: publishJob.idempotencyKey
    });

    await persistConfirmedPublishResult(() => prisma.$transaction([
      prisma.publishJob.update({
        where: { id: publishJob.id },
        data: {
          status: "succeeded",
          providerPostId: publishResult.providerPostId,
          providerPermalink: publishResult.providerPermalink ?? null,
          rawResponse: publishResult.rawResponse,
          lastError: null
        }
      }),
      prisma.schedule.update({
        where: { id: publishJob.scheduleId },
        data: {
          status: "published"
        }
      }),
      prisma.postVariant.update({
        where: { id: publishJob.postVariantId },
        data: {
          publishStatus: "published"
        }
      })
    ]), publishJob.schedule.postVariant.platform);

    return {
      providerPostId: publishResult.providerPostId,
      providerPermalink: publishResult.providerPermalink
    };
  },
  {
    connection: redisConnection,
    concurrency: config.WORKER_CONCURRENCY
  }
);

async function initializeWorker() {
  const correctedCount = await repairSimulatedInstagramPublishJobs();
  if (correctedCount) {
    console.log(`Corrected ${correctedCount} simulated Instagram publish record(s)`);
  }

  const recoveredCount = await recoverPendingPublishJobs();
  console.log(`Recovered ${recoveredCount} pending publish jobs`);
}

initializeWorker().catch((error) => {
  console.error("Failed to initialize publish worker", error);
});

async function runMediaCleanup() {
  try {
    const draftResult = await cleanUpExpiredDrafts();
    const result = await cleanUpExpiredMedia();
    if (draftResult.scanned || result.scanned) {
      console.log(
        `Draft cleanup: deleted ${draftResult.deleted}/${draftResult.scanned}; media cleanup: originals archived ${result.archived}, records deleted ${result.deleted}/${result.scanned}, failed ${result.failed}`
      );
    }
  } catch (error) {
    console.error("Media cleanup failed", error);
  }
}

void runMediaCleanup();
const cleanupTimer = setInterval(
  () => void runMediaCleanup(),
  config.MEDIA_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000
);

async function runPinterestRefresh() {
  try {
    const dueCount = await refreshDuePinterestAccounts();
    if (dueCount) console.log(`Checked ${dueCount} Pinterest account(s) for token renewal`);
  } catch (error) {
    console.error("Pinterest token renewal scan failed", error);
  }
}

void runPinterestRefresh();
const pinterestRefreshTimer = setInterval(() => void runPinterestRefresh(), 6 * 60 * 60 * 1000);

async function runInstagramRefresh() {
  try {
    const dueCount = await refreshDueInstagramAccounts();
    if (dueCount) console.log(`Checked ${dueCount} Instagram account(s) for token renewal`);
  } catch (error) {
    console.error("Instagram token renewal scan failed", error);
  }
}

void runInstagramRefresh();
const instagramRefreshTimer = setInterval(() => void runInstagramRefresh(), 6 * 60 * 60 * 1000);

const authorizationChecks = {
  youtube: refreshDueYouTubeAccounts,
  tiktok: refreshDueTikTokAccounts,
  facebook: checkDueFacebookPages
};

async function withAuthorizationLease(provider: AuthorizationProvider, check: () => Promise<number>) {
  const key = `auth-refresh:${provider}`;
  const owner = randomUUID();
  const acquired = await redis.set(key, owner, "PX", 30 * 60_000, "NX");
  if (acquired !== "OK") return null;
  try {
    return await check();
  } finally {
    await redis.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      1,
      key,
      owner
    );
  }
}

void runAuthorizationChecks(authorizationChecks, withAuthorizationLease);
const authorizationTimers = (Object.keys(authorizationRefreshIntervalsMs) as AuthorizationProvider[]).map((provider) =>
  setInterval(
    () => void runAuthorizationChecks(authorizationChecks, withAuthorizationLease, console.log, [provider]),
    authorizationRefreshIntervalsMs[provider]
  )
);

worker.on("completed", (job) => {
  console.log(`Publish job completed: ${job.id}`);
});

worker.on("failed", async (job, error) => {
  console.error(`Publish job failed: ${job?.id}`, error);

  if (!job?.data.publishJobId) {
    return;
  }

  const maxAttempts = job.opts.attempts ?? 1;
  const hasRemainingAttempts = hasRemainingPublishAttempts(error, job.attemptsMade, maxAttempts);
  const nextStatus = hasRemainingAttempts ? "retrying" : "dead";

  const publishJob = await prisma.publishJob.findUnique({
    where: {
      id: job.data.publishJobId
    }
  });

  if (!publishJob) {
    return;
  }

  if (hasRemainingAttempts) {
    await prisma.$transaction([
      prisma.publishJob.update({
        where: { id: publishJob.id },
        data: {
          status: nextStatus,
          lastError: error.message
        }
      }),
      prisma.schedule.update({
        where: { id: publishJob.scheduleId },
        data: {
          status: "scheduled"
        }
      }),
      prisma.postVariant.update({
        where: { id: publishJob.postVariantId },
        data: {
          publishStatus: "queued"
        }
      })
    ]);
    return;
  }

  await prisma.$transaction([
    prisma.publishJob.update({
      where: { id: publishJob.id },
      data: {
        status: nextStatus,
        lastError: error.message
      }
    }),
    prisma.schedule.update({
      where: { id: publishJob.scheduleId },
      data: {
        status: "failed"
      }
    }),
    prisma.postVariant.update({
      where: { id: publishJob.postVariantId },
      data: {
        publishStatus: "failed"
      }
    })
  ]);
});

async function shutdown() {
  console.log("Shutting down worker");
  clearInterval(cleanupTimer);
  clearInterval(pinterestRefreshTimer);
  clearInterval(instagramRefreshTimer);
  authorizationTimers.forEach(clearInterval);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
