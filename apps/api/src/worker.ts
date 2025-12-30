import { and, eq, lt, or } from "drizzle-orm";
import { backendJobs } from "@reimbursement/shared/db";
import { db } from "./db/client.js";
import { processBatchCheckJob } from "./worker/jobs/batch-check.js";
import { processExportJob } from "./worker/jobs/export.js";
import { logError, logInfo } from "./utils/logger.js";

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

    const attempt = job.attempts + 1;
    const jobStartTime = Date.now();
    logInfo("worker.job.start", {
      jobId: job.jobId,
      type: job.type,
      attempt,
    });

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

      logInfo("worker.job.completed", {
        jobId: job.jobId,
        type: job.type,
        attempt,
        durationMs: Date.now() - jobStartTime,
      });
    } catch (error: any) {
      logError("worker.job.failed", error, {
        jobId: job.jobId,
        type: job.type,
        attempt,
        durationMs: Date.now() - jobStartTime,
      });

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
    logError("worker.polling.error", err);
  }
}

export function startWorkerLoop() {
  logInfo("worker.started", { mode: "in-process" });

  const loop = async () => {
    await pollJobs();
    setTimeout(loop, POLLING_INTERVAL);
  };

  loop();
}
