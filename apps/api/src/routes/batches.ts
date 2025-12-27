import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { batches, backendJobs, exportRecords } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

router.use("*", authMiddleware);

router.get("/projects/:projectId/batches", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const data = await db
    .select()
    .from(batches)
    .where(and(eq(batches.userId, userId), eq(batches.projectId, projectId)))
    .orderBy(batches.createdAt);
  return ok(c, data);
});

router.post("/projects/:projectId/batches", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");

  // 自动生成批次名称：格式为 "2024-12-28 导出"
  const today = new Date();
  const name = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")} 导出`;

  // 不再使用筛选条件，filterJson 设为空对象
  const filterJson = {};

  const [batch] = await db
    .insert(batches)
    .values({
      userId,
      projectId,
      name,
      filterJson
    })
    .returning();

  await db.insert(backendJobs).values({
    type: "batch_check",
    payload: { batchId: batch.batchId, userId },
    status: "pending",
  });

  return ok(c, batch);
});

router.get("/batches/:batchId", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  return ok(c, batch);
});

router.post("/batches/:batchId/check", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  await db.insert(backendJobs).values({
    type: "batch_check",
    payload: { batchId, userId },
    status: "pending",
  });

  return ok(c, { success: true });
});

router.get("/batches/:batchId/exports", async (c) => {
  const { userId } = c.get("auth");
  const batchId = c.req.param("batchId");

  // 验证批次存在且属于当前用户
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.batchId, batchId), eq(batches.userId, userId)));

  if (!batch) {
    return errorResponse(c, 404, "BATCH_NOT_FOUND", "Batch not found");
  }

  // 获取该批次的所有导出记录，按创建时间倒序
  const exports = await db
    .select()
    .from(exportRecords)
    .where(and(eq(exportRecords.batchId, batchId), eq(exportRecords.userId, userId)))
    .orderBy(desc(exportRecords.createdAt));

  return ok(c, exports);
});

export default router;
