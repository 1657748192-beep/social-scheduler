import type { JobStatus, WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  publishQueue,
  publishQueueBackoffMs,
  publishQueueJobName,
  publishQueueMaxAttempts
} from "../queues/publishQueue";
import { HttpError } from "../utils/errors";
import { requireWorkspaceMembership } from "./workspaceService";

const writableRoles: WorkspaceRole[] = ["owner", "admin", "editor"];
const activeScheduleStatuses = ["scheduled", "locked"] as const;

export const createScheduleSchema = z.object({
  postVariantId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  timezone: z.string().min(1).max(80).default("Asia/Shanghai")
});

export const listSchedulesSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(["scheduled", "locked", "published", "failed", "canceled"]).optional()
});

export const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  timezone: z.string().min(1).max(80).optional()
});

const scheduleInclude = {
  postVariant: {
    include: {
      post: true,
      media: {
        include: {
          mediaAsset: true
        },
        orderBy: {
          sortOrder: "asc" as const
        }
      }
    }
  },
  publishJobs: {
    orderBy: {
      createdAt: "desc" as const
    }
  }
};

function ensureCanSchedule(role: WorkspaceRole) {
  if (!writableRoles.includes(role)) {
    throw new HttpError(403, "Viewer role cannot schedule or publish content");
  }
}

function parseFutureDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Invalid scheduledAt value");
  }

  if (date.getTime() <= Date.now()) {
    throw new HttpError(400, "scheduledAt must be in the future");
  }

  return date;
}

export async function enqueuePublishJob(publishJobId: string, scheduledAt: Date) {
  await publishQueue.add(
    publishQueueJobName,
    { publishJobId },
    {
      jobId: publishJobId,
      delay: Math.max(0, scheduledAt.getTime() - Date.now()),
      attempts: publishQueueMaxAttempts,
      backoff: {
        type: "exponential",
        delay: publishQueueBackoffMs
      },
      removeOnComplete: 1000,
      removeOnFail: false
    }
  );
}

export async function enqueuePublishJobs(jobs: Array<{ id: string; scheduledAt: Date }>) {
  await Promise.all(jobs.map((job) => enqueuePublishJob(job.id, job.scheduledAt)));
}

async function removeQueueJob(publishJobId: string) {
  const queueJob = await publishQueue.getJob(publishJobId);

  if (queueJob) {
    await queueJob.remove();
  }
}

async function assertVariantIsSchedulable(workspaceId: string, postVariantId: string) {
  const variant = await prisma.postVariant.findFirst({
    where: {
      id: postVariantId,
      post: {
        workspaceId
      }
    },
    include: {
      post: true,
      schedules: {
        where: {
          status: {
            in: [...activeScheduleStatuses]
          }
        }
      }
    }
  });

  if (!variant) {
    throw new HttpError(404, "Post variant not found");
  }

  if (variant.publishStatus === "published") {
    throw new HttpError(400, "Published variants cannot be scheduled again");
  }

  if (variant.schedules.length) {
    throw new HttpError(409, "This post variant already has an active schedule");
  }

  if (Array.isArray(variant.validationErrors) && variant.validationErrors.length) {
    throw new HttpError(400, "Cannot schedule a variant with validation errors", variant.validationErrors);
  }

  return variant;
}

export async function createSchedule(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof createScheduleSchema>
) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanSchedule(membership.role);

  const scheduledAt = parseFutureDate(input.scheduledAt);
  await assertVariantIsSchedulable(workspaceId, input.postVariantId);

  const result = await prisma.$transaction(async (tx) => {
    const schedule = await tx.schedule.create({
      data: {
        postVariantId: input.postVariantId,
        workspaceId,
        scheduledAt,
        timezone: input.timezone,
        status: "scheduled",
        createdBy: userId
      }
    });

    const publishJob = await tx.publishJob.create({
      data: {
        scheduleId: schedule.id,
        postVariantId: input.postVariantId,
        workspaceId,
        status: "waiting",
        maxAttempts: publishQueueMaxAttempts,
        idempotencyKey: `${schedule.id}:${input.postVariantId}`
      }
    });

    await tx.postVariant.update({
      where: { id: input.postVariantId },
      data: {
        publishStatus: "queued"
      }
    });

    await tx.post.updateMany({
      where: {
        variants: {
          some: {
            id: input.postVariantId
          }
        }
      },
      data: {
        workflowStatus: "scheduled"
      }
    });

    return { schedule, publishJob };
  });

  await enqueuePublishJob(result.publishJob.id, scheduledAt);

  return {
    schedule: result.schedule,
    publishJob: result.publishJob,
    queueDelayMs: Math.max(0, scheduledAt.getTime() - Date.now())
  };
}

export async function listSchedules(
  userId: string,
  workspaceId: string,
  query: z.infer<typeof listSchedulesSchema>
) {
  await requireWorkspaceMembership(userId, workspaceId);

  return prisma.schedule.findMany({
    where: {
      workspaceId,
      status: query.status,
      scheduledAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined
      }
    },
    include: scheduleInclude,
    orderBy: {
      scheduledAt: "asc"
    }
  });
}

export async function getSchedule(userId: string, workspaceId: string, scheduleId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const schedule = await prisma.schedule.findFirst({
    where: {
      id: scheduleId,
      workspaceId
    },
    include: scheduleInclude
  });

  if (!schedule) {
    throw new HttpError(404, "Schedule not found");
  }

  return schedule;
}

export async function rescheduleSchedule(
  userId: string,
  workspaceId: string,
  scheduleId: string,
  input: z.infer<typeof rescheduleSchema>
) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanSchedule(membership.role);

  const scheduledAt = parseFutureDate(input.scheduledAt);
  const schedule = await prisma.schedule.findFirst({
    where: {
      id: scheduleId,
      workspaceId
    },
    include: {
      publishJobs: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!schedule || !schedule.publishJobs[0]) {
    throw new HttpError(404, "Schedule or publish job not found");
  }

  if (schedule.status !== "scheduled") {
    throw new HttpError(400, "Only scheduled items can be rescheduled");
  }

  const publishJob = schedule.publishJobs[0];

  if (publishJob.status !== "waiting" && publishJob.status !== "retrying") {
    throw new HttpError(400, "Only waiting publish jobs can be rescheduled");
  }

  await removeQueueJob(publishJob.id);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.publishJob.update({
      where: {
        id: publishJob.id
      },
      data: {
        status: "waiting",
        lastError: null,
        lockedAt: null
      }
    });

    return tx.schedule.update({
      where: {
        id: schedule.id
      },
      data: {
        scheduledAt,
        timezone: input.timezone ?? schedule.timezone
      },
      include: scheduleInclude
    });
  });

  await enqueuePublishJob(publishJob.id, scheduledAt);

  return updated;
}

export async function cancelSchedule(userId: string, workspaceId: string, scheduleId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanSchedule(membership.role);

  const schedule = await prisma.schedule.findFirst({
    where: {
      id: scheduleId,
      workspaceId
    },
    include: {
      publishJobs: {
        where: {
          status: {
            in: ["waiting", "retrying"]
          }
        }
      }
    }
  });

  if (!schedule) {
    throw new HttpError(404, "Schedule not found");
  }

  if (schedule.status !== "scheduled") {
    throw new HttpError(400, "Only schedules that have not started can be canceled");
  }

  await Promise.all(schedule.publishJobs.map((job) => removeQueueJob(job.id)));

  return prisma.$transaction(async (tx) => {
    await tx.publishJob.updateMany({
      where: {
        scheduleId,
        status: {
          in: ["waiting", "retrying"]
        }
      },
      data: {
        status: "failed",
        lastError: "Canceled by user"
      }
    });

    await tx.postVariant.update({
      where: {
        id: schedule.postVariantId
      },
      data: {
        publishStatus: "canceled"
      }
    });

    return tx.schedule.update({
      where: { id: scheduleId },
      data: {
        status: "canceled"
      }
    });
  });
}

export async function publishNow(userId: string, workspaceId: string, scheduleId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanSchedule(membership.role);

  const schedule = await prisma.schedule.findFirst({
    where: {
      id: scheduleId,
      workspaceId
    },
    include: {
      publishJobs: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!schedule || !schedule.publishJobs[0]) {
    throw new HttpError(404, "Schedule or publish job not found");
  }

  if (schedule.status !== "scheduled") {
    throw new HttpError(400, "Only scheduled jobs can be published immediately");
  }

  const publishJob = schedule.publishJobs[0];
  await removeQueueJob(publishJob.id);
  await enqueuePublishJob(publishJob.id, new Date());

  return {
    scheduleId: schedule.id,
    publishJobId: publishJob.id,
    queued: true
  };
}

export async function retryPublishJob(userId: string, workspaceId: string, publishJobId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanSchedule(membership.role);

  const publishJob = await prisma.publishJob.findFirst({
    where: {
      id: publishJobId,
      workspaceId
    },
    include: {
      schedule: true
    }
  });

  if (!publishJob) {
    throw new HttpError(404, "Publish job not found");
  }

  const retryableStatuses: JobStatus[] = ["failed", "dead"];

  if (!retryableStatuses.includes(publishJob.status)) {
    throw new HttpError(400, "Only failed publish jobs can be retried");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.schedule.update({
      where: { id: publishJob.scheduleId },
      data: { status: "scheduled" }
    });

    await tx.postVariant.update({
      where: { id: publishJob.postVariantId },
      data: { publishStatus: "queued" }
    });

    return tx.publishJob.update({
      where: { id: publishJob.id },
      data: {
        status: "waiting",
        attempts: 0,
        lastError: null,
        lockedAt: null
      }
    });
  });

  await removeQueueJob(updated.id);
  await enqueuePublishJob(updated.id, new Date());

  return updated;
}

export async function recoverPendingPublishJobs() {
  const pendingJobs = await prisma.publishJob.findMany({
    where: {
      status: {
        in: ["waiting", "retrying"]
      },
      schedule: {
        status: {
          in: ["scheduled", "locked"]
        }
      }
    },
    include: {
      schedule: true
    },
    take: 1000
  });

  await enqueuePublishJobs(
    pendingJobs.map((job) => ({
      id: job.id,
      scheduledAt: job.schedule.scheduledAt
    }))
  );

  return pendingJobs.length;
}
