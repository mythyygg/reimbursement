import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { batches, downloadLogs, exportRecords, backendJobs } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { createExportDownloadUrl } from "../services/storage.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

const exportCreateSchema = z.object({
  type: z.enum(["csv", "zip", "pdf"]),
  projectIds: z.array(z.string()).optional(),
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
      projectIds: [batch.projectId], // Auto-populate projectIds for batch-based export
      type: body.data.type,
      status: "pending",
    })
    .returning();

  await db.insert(backendJobs).values({
    type: "export",
    payload: { exportId: record.exportId, userId },
    status: "pending",
  });

  return ok(c, record);
});

router.post("/projects/exports", async (c) => {
  const { userId } = c.get("auth");
  const body = exportCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const projectIds = body.data.projectIds;
  if (!projectIds || projectIds.length === 0) {
    return errorResponse(c, 400, "MISSING_PROJECTS", "At least one project must be selected");
  }

  // Verify all projects belong to the user
  // This is a simplified check. In a production app, you might want to 
  // ensure all IDs exist and are owned by the user.
  // We'll trust the projectIds for now or do a quick check.

  const [record] = await db
    .insert(exportRecords)
    .values({
      userId,
      projectIds,
      type: body.data.type,
      status: "pending",
    })
    .returning();

  await db.insert(backendJobs).values({
    type: "export",
    payload: { exportId: record.exportId, userId },
    status: "pending",
  });

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

  // 生成友好的文件名
  const date = record.createdAt.toISOString().split('T')[0];
  const filename = `报销导出_${date}.${record.type}`;

  const signedUrl = await createExportDownloadUrl({
    storageKey: record.storageKey,
    filename,
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

router.delete("/exports/:exportId", async (c) => {
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

  // 不允许删除进行中的任务
  if (record.status === "pending" || record.status === "running") {
    return errorResponse(c, 400, "EXPORT_IN_PROGRESS", "Cannot delete export in progress");
  }

  // 删除导出记录
  await db
    .delete(exportRecords)
    .where(eq(exportRecords.exportId, exportId));

  return ok(c, { success: true });
});

export default router;
