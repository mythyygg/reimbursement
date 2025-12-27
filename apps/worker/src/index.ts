import "./env.js";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { backendJobs } from "@reimbursement/shared/db";
import { db } from "./db/client.js";
import { processBatchCheckJob } from "./jobs/batch-check.js";
import { processExportJob } from "./jobs/export.js";

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_ATTEMPTS = 3;

async function pollJobs() {
  try {
    // 1. Find a pending job or a failed job that is ready for retry
    const [job] = await db
      .select()
      .from(backendJobs)
      .where(
        and(
          or(eq(backendJobs.status, "pending"), eq(backendJobs.status, "failed")),
          lt(backendJobs.attempts, MAX_ATTEMPTS),
          lt(backendJobs.scheduledAt, new Date())
        )
      )
      .limit(1)
      .for("update", { skipLocked: true });

    if (!job) {
      return;
    }

    console.log(`[worker] Processing job ${job.jobId} (${job.type})`);

    // 2. Mark job as processing
    await db
      .update(backendJobs)
      .set({
        status: "processing",
        startedAt: new Date(),
        attempts: job.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(backendJobs.jobId, job.jobId));

    // 3. Execute job
    try {
      if (job.type === "batch_check") {
        await processBatchCheckJob(job.payload as { batchId: string; userId: string });
      } else if (job.type === "export") {
        await processExportJob(job.payload as { exportId: string; userId: string });
      }

      // 4. Mark as completed
      await db
        .update(backendJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(backendJobs.jobId, job.jobId));

      console.log(`[worker] Job ${job.jobId} completed`);
    } catch (error: any) {
      console.error(`[worker] Job ${job.jobId} failed:`, error);

      // 5. Mark as failed and schedule retry
      const nextRetry = new Date(Date.now() + 60000); // Retry in 1 minute
      await db
        .update(backendJobs)
        .set({
          status: "failed",
          error: error?.message || String(error),
          scheduledAt: nextRetry,
          updatedAt: new Date(),
        })
        .where(eq(backendJobs.jobId, job.jobId));
    }
  } catch (err) {
    console.error("[worker] Polling error:", err);
  }
}

async function run() {
  console.log("Worker started (DB Polling mode)");

  // Continuously poll for jobs
  while (true) {
    await pollJobs();
    await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
  }
}

run().catch(err => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
