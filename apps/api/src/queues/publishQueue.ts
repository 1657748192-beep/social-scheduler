import { Queue } from "bullmq";
import { redisConnection } from "../redis";

export type PublishQueuePayload = {
  publishJobId: string;
};

export const publishQueueName = "publish" as const;
export const publishQueueJobName = "publish-post" as const;
export const publishQueueMaxAttempts = 3;
export const publishQueueBackoffMs = 5000;

export const publishQueue = new Queue<PublishQueuePayload, unknown, typeof publishQueueJobName>(publishQueueName, {
  connection: redisConnection
});
