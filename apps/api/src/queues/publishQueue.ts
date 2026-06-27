import { Queue } from "bullmq";
import { redis } from "../redis";

export type PublishQueuePayload = {
  publishJobId: string;
};

export const publishQueueName = "publish";
export const publishQueueJobName = "publish-post";
export const publishQueueMaxAttempts = 3;
export const publishQueueBackoffMs = 5000;

export const publishQueue = new Queue<PublishQueuePayload>("publish", {
  connection: redis
});
