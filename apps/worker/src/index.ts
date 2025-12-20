import "./env.js";
import { Worker } from "bullmq";
import { QUEUE_NAMES } from "@reimbursement/shared/domain";
import { connection } from "./queue";
import { processBatchCheckJob } from "./jobs/batch-check";
import { processExportJob } from "./jobs/export";

const batchWorker = new Worker(
  QUEUE_NAMES.batchCheck,
  async (job) => {
    await processBatchCheckJob(job.data as { batchId: string; userId: string });
  },
  { connection }
);

const exportWorker = new Worker(
  QUEUE_NAMES.export,
  async (job) => {
    await processExportJob(job.data as { exportId: string; userId: string });
  },
  { connection }
);

batchWorker.on("failed", (job, err) => {
  console.error("Batch job failed", job?.id, err);
});

exportWorker.on("failed", (job, err) => {
  console.error("Export job failed", job?.id, err);
});

console.log("Worker started");
