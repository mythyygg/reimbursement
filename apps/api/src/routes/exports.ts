import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { batches, downloadLogs, exportRecords } from "@reimbursement/shared/db";
import { db } from "../db/client";
import { authMiddleware } from "../middleware/auth";
import { exportQueue } from "../queue";
import { createExportDownloadUrl } from "../services/storage";
import { errorResponse, ok } from "../utils/http";

const router = new Hono();

const exportCreateSchema = z.object({
  type: z.enum(["csv", "zip", "pdf"]),
});

router.use("*", authMiddleware);

router.post("/batches/:batchId/exports", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");
  const body = exportCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));
  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  const existing = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.batchId, batchId),
        eq(exportRecords.userId, userId),
        eq(exportRecords.type, body.data.type),
        eq(exportRecords.status, "running")
      )
    );

  if (existing.length > 0) {
    // Deduplicate concurrent requests: reuse running export to avoid 409 / duplicate jobs.
    return ok(c, existing[0]);
  }

  const [record] = await db
    .insert(exportRecords)
    .values({
      batchId,
      userId,
      type: body.data.type,
      status: "pending",
    })
    .returning();

  await exportQueue.add(
    "export-generate",
    { exportId: record.exportId, userId },
    { removeOnComplete: true, removeOnFail: true }
  );

  return ok(c, record);
});

router.get("/exports/:exportId", async (c) => {
  const { userId } = c.get("auth");
  const exportId = c.req.param("exportId");
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );

  if (!record) {
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  return ok(c, record);
});

router.post("/exports/:exportId/download-url", async (c) => {
  const { userId } = c.get("auth");
  const exportId = c.req.param("exportId");
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );

  if (!record || !record.storageKey) {
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return errorResponse(c, 410, "EXPORT_EXPIRED", "Export expired");
  }

  const signedUrl = await createExportDownloadUrl({
    storageKey: record.storageKey,
  });
  await db.insert(downloadLogs).values({
    userId,
    fileType: "export",
    fileId: record.exportId,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });

  return ok(c, { signed_url: signedUrl });
});

export default router;
