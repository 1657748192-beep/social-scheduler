import type { Request, Response } from "express";
import { prisma } from "../prisma";
import { redis } from "../redis";

export async function healthController(_req: Request, res: Response) {
  await prisma.$queryRaw`SELECT 1`;
  const redisPing = await redis.ping();

  return res.json({
    ok: true,
    service: "social-scheduler-api",
    database: "ok",
    redis: redisPing
  });
}
