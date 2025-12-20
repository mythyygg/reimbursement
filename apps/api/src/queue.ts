import { Queue } from "bullmq";
import Redis from "ioredis";
import { QUEUE_NAMES } from "@reimbursement/shared/domain";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
export const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

export const batchCheckQueue = new Queue(QUEUE_NAMES.batchCheck, {
  connection,
});
export const exportQueue = new Queue(QUEUE_NAMES.export, { connection });
