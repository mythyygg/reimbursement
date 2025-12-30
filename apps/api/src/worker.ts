import { and, eq, lt, or } from "drizzle-orm";
import { backendJobs } from "@reimbursement/shared/db";
import { db } from "./db/client.js";
import { processBatchCheckJob } from "./worker/jobs/batch-check";
import { processExportJob } from "./worker/jobs/export";

const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_ATTEMPTS = 3;

async function pollJobs() {
  try {
    const [job] = await db
      .select()
      .from(backendJobs)
      .where(
        and(
          or(
            eq(backendJobs.status, "pending"),
            eq(backendJobs.status, "failed")
          ),
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

    await db
      .update(backendJobs)
      .set({
        status: "processing",
        startedAt: new Date(),
        attempts: job.attempts + 1,
        updatedAt: new Date(),
      })
      .where(eq(backendJobs.jobId, job.jobId));

    try {
      if (job.type === "batch_check") {
        await processBatchCheckJob(
          job.payload as { batchId: string; userId: string }
        );
      } else if (job.type === "export") {
        await processExportJob(
          job.payload as { exportId: string; userId: string }
        );
      }

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

export function startWorkerLoop() {
  console.log("Worker started (in-process)");

  const loop = async () => {
    await pollJobs();
    setTimeout(loop, POLLING_INTERVAL);
  };

  loop();
}
