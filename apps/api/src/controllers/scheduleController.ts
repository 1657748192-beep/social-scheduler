import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma";
import {
  cancelSchedule,
  createSchedule,
  createScheduleSchema,
  getSchedule,
  listSchedules,
  listSchedulesSchema,
  publishNow,
  rescheduleSchedule,
  rescheduleSchema,
  retryPublishJob
} from "../services/scheduleService";
import { requireWorkspaceMembership } from "../services/workspaceService";

const createDemoScheduleSchema = z.object({
  workspaceId: z.string().uuid(),
  text: z.string().min(1).max(280),
  platform: z.enum(["x", "instagram", "facebook", "tiktok"]).default("x"),
  scheduledAt: z.string().datetime()
});

export async function createScheduleController(req: Request, res: Response) {
  const body = createScheduleSchema.parse(req.body);
  const result = await createSchedule(req.user!.id, req.params.workspaceId, body);
  return res.status(201).json(result);
}

export async function listSchedulesController(req: Request, res: Response) {
  const query = listSchedulesSchema.parse(req.query);
  const schedules = await listSchedules(req.user!.id, req.params.workspaceId, query);
  return res.json(schedules);
}

export async function getScheduleController(req: Request, res: Response) {
  const schedule = await getSchedule(req.user!.id, req.params.workspaceId, req.params.scheduleId);
  return res.json(schedule);
}

export async function rescheduleScheduleController(req: Request, res: Response) {
  const body = rescheduleSchema.parse(req.body);
  const schedule = await rescheduleSchedule(
    req.user!.id,
    req.params.workspaceId,
    req.params.scheduleId,
    body
  );
  return res.json(schedule);
}

export async function cancelScheduleController(req: Request, res: Response) {
  const schedule = await cancelSchedule(req.user!.id, req.params.workspaceId, req.params.scheduleId);
  return res.json(schedule);
}

export async function publishNowController(req: Request, res: Response) {
  const result = await publishNow(req.user!.id, req.params.workspaceId, req.params.scheduleId);
  return res.json(result);
}

export async function retryPublishJobController(req: Request, res: Response) {
  const result = await retryPublishJob(req.user!.id, req.params.workspaceId, req.params.publishJobId);
  return res.json(result);
}

export async function createDemoScheduleController(req: Request, res: Response) {
  const body = createDemoScheduleSchema.parse(req.body);
  await requireWorkspaceMembership(req.user!.id, body.workspaceId);

  const post = await prisma.post.create({
    data: {
      workspaceId: body.workspaceId,
      authorId: req.user!.id,
      baseText: body.text,
      workflowStatus: "draft",
      variants: {
        create: {
          platform: body.platform,
          text: body.text,
          publishStatus: "draft"
        }
      }
    },
    include: {
      variants: true
    }
  });

  const result = await createSchedule(req.user!.id, body.workspaceId, {
    postVariantId: post.variants[0].id,
    scheduledAt: body.scheduledAt,
    timezone: "UTC"
  });

  return res.status(201).json({
    scheduleId: result.schedule.id,
    publishJobId: result.publishJob.id,
    scheduledAt: result.schedule.scheduledAt,
    queueDelayMs: result.queueDelayMs
  });
}
