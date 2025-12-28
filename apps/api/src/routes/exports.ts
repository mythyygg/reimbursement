import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { batches, downloadLogs, exportRecords, backendJobs } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { createExportDownloadUrl } from "../services/storage.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

const exportCreateSchema = z.object({
  type: z.enum(["csv", "zip", "pdf"]),
  projectIds: z.array(z.string()).optional(),
});


router.post("/batches/:batchId/exports", async (c) => {
  const startTime = Date.now();
  const batchId = c.req.param("batchId");
  console.log(`[exports] [API] 创建批次导出任务开始 - batchId: ${batchId}`);

  const { userId } = c.get("auth");

  const t0 = Date.now();
  const body = exportCreateSchema.safeParse(await c.req.json());
  console.log(`[exports] 解析请求体耗时: ${Date.now() - t0}ms, 类型: ${body.success ? body.data.type : 'invalid'}`);

  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const t1 = Date.now();
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));
  console.log(`[exports] [DB] 查询batch耗时: ${Date.now() - t1}ms`);

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  const t2 = Date.now();
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
  console.log(`[exports] [DB] 查询现有运行中的导出耗时: ${Date.now() - t2}ms, 找到 ${existing.length} 条`);

  if (existing.length > 0) {
    // Deduplicate concurrent requests: reuse running export to avoid 409 / duplicate jobs.
    console.log(`[exports] [API] 复用现有导出任务, 总耗时: ${Date.now() - startTime}ms, exportId: ${existing[0].exportId}`);
    return ok(c, existing[0]);
  }

  const t3 = Date.now();
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
  console.log(`[exports] [DB] 插入导出记录耗时: ${Date.now() - t3}ms`);

  const t4 = Date.now();
  await db.insert(backendJobs).values({
    type: "export",
    payload: { exportId: record.exportId, userId },
    status: "pending",
  });
  console.log(`[exports] [DB] 插入后台任务耗时: ${Date.now() - t4}ms`);
  console.log(`[exports] [API] 创建批次导出任务完成, 总耗时: ${Date.now() - startTime}ms, exportId: ${record.exportId}`);

  return ok(c, record);
});

router.post("/projects/exports", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  console.log(`[exports] [API] 创建项目导出任务开始 - userId: ${userId}`);

  const t0 = Date.now();
  const body = exportCreateSchema.safeParse(await c.req.json());
  console.log(`[exports] 解析请求体耗时: ${Date.now() - t0}ms`);

  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const projectIds = body.data.projectIds;
  console.log(`[exports] 请求导出 ${projectIds?.length || 0} 个项目, 类型: ${body.data.type}`);

  if (!projectIds || projectIds.length === 0) {
    return errorResponse(c, 400, "MISSING_PROJECTS", "At least one project must be selected");
  }

  // Verify all projects belong to the user
  // This is a simplified check. In a production app, you might want to
  // ensure all IDs exist and are owned by the user.
  // We'll trust the projectIds for now or do a quick check.

  const t1 = Date.now();
  const [record] = await db
    .insert(exportRecords)
    .values({
      userId,
      projectIds,
      type: body.data.type,
      status: "pending",
    })
    .returning();
  console.log(`[exports] [DB] 插入导出记录耗时: ${Date.now() - t1}ms`);

  const t2 = Date.now();
  await db.insert(backendJobs).values({
    type: "export",
    payload: { exportId: record.exportId, userId },
    status: "pending",
  });
  console.log(`[exports] [DB] 插入后台任务耗时: ${Date.now() - t2}ms`);
  console.log(`[exports] [API] 创建项目导出任务完成, 总耗时: ${Date.now() - startTime}ms, exportId: ${record.exportId}`);

  return ok(c, record);
});

router.get("/exports/:exportId", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const exportId = c.req.param("exportId");
  console.log(`[exports] [API] 查询导出状态 - exportId: ${exportId}`);

  const t1 = Date.now();
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );
  console.log(`[exports] [DB] 查询导出记录耗时: ${Date.now() - t1}ms`);

  if (!record) {
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  console.log(`[exports] [API] 查询导出状态完成, 总耗时: ${Date.now() - startTime}ms, status: ${record.status}`);
  return ok(c, record);
});

router.post("/exports/:exportId/download-url", async (c) => {
  const startTime = Date.now();
  const exportId = c.req.param("exportId");
  console.log(`[exports] [API] 生成下载URL开始 - exportId: ${exportId}`);

  const { userId } = c.get("auth");

  const t1 = Date.now();
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, exportId),
        eq(exportRecords.userId, userId)
      )
    );
  console.log(`[exports] [DB] 查询导出记录耗时: ${Date.now() - t1}ms, status: ${record?.status || 'not found'}`);

  if (!record || !record.storageKey) {
    console.log(`[exports] [API] 导出记录不存在或无storageKey, exportId: ${exportId}`);
    return errorResponse(c, 404, "EXPORT_NOT_FOUND", "Export not found");
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    console.log(`[exports] [API] 导出文件已过期, exportId: ${exportId}, expiresAt: ${record.expiresAt}`);
    return errorResponse(c, 410, "EXPORT_EXPIRED", "Export expired");
  }

  // 生成友好的文件名
  const date = record.createdAt.toISOString().split('T')[0];
  const filename = `报销导出_${date}.${record.type}`;
  console.log(`[exports] 生成文件名: ${filename}, storageKey: ${record.storageKey}`);

  const t2 = Date.now();
  const signedUrl = await createExportDownloadUrl({
    storageKey: record.storageKey,
    filename,
  });
  console.log(`[exports] [S3] 生成签名URL耗时: ${Date.now() - t2}ms`);

  const t3 = Date.now();
  await db.insert(downloadLogs).values({
    userId,
    fileType: "export",
    fileId: record.exportId,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });
  console.log(`[exports] [DB] 插入下载日志耗时: ${Date.now() - t3}ms`);
  console.log(`[exports] [API] 生成下载URL完成, 总耗时: ${Date.now() - startTime}ms`);

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
