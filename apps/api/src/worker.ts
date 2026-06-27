import { Worker } from "bullmq";
import { getSocialPublisher } from "./integrations/social/registry";
import { prisma } from "./prisma";
import { redisConnection } from "./redis";
import { publishQueueJobName, publishQueueName, type PublishQueuePayload } from "./queues/publishQueue";
import { recoverPendingPublishJobs } from "./services/scheduleService";

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
            postVariant: true
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

    const publisher = getSocialPublisher(publishJob.schedule.postVariant.platform);
    const publishResult = await publisher.publish({
      platform: publishJob.schedule.postVariant.platform,
      text: publishJob.schedule.postVariant.text,
      idempotencyKey: publishJob.idempotencyKey
    });

    await prisma.$transaction([
      prisma.publishJob.update({
        where: { id: publishJob.id },
        data: {
          status: "succeeded",
          providerPostId: publishResult.providerPostId,
          providerPermalink: publishResult.providerPermalink,
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
    ]);

    return {
      providerPostId: publishResult.providerPostId,
      providerPermalink: publishResult.providerPermalink
    };
  },
  {
    connection: redisConnection,
    concurrency: 5
  }
);

recoverPendingPublishJobs()
  .then((count) => {
    console.log(`Recovered ${count} pending publish jobs`);
  })
  .catch((error) => {
    console.error("Failed to recover pending publish jobs", error);
  });

worker.on("completed", (job) => {
  console.log(`Publish job completed: ${job.id}`);
});

worker.on("failed", async (job, error) => {
  console.error(`Publish job failed: ${job?.id}`, error);

  if (!job?.data.publishJobId) {
    return;
  }

  const maxAttempts = job.opts.attempts ?? 1;
  const hasRemainingAttempts = job.attemptsMade < maxAttempts;
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
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
