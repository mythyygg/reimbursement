import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { projects, receipts, expenses, batches } from "@reimbursement/shared/db";
import { db } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();

const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "name_required"),
  description: z.string().trim().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const projectUpdateSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

router.use("*", authMiddleware);

router.get("/", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const search = c.req.query("search");
  const pinned = c.req.query("pinned");
  const archived = c.req.query("archived");

  const filters: SQL<unknown>[] = [eq(projects.userId, userId)];

  if (archived === undefined) {
    // Default to showing only active projects unless caller opts into archived ones.
    filters.push(eq(projects.archived, false));
  } else {
    filters.push(eq(projects.archived, archived === "true"));
  }

  if (pinned !== undefined) {
    filters.push(eq(projects.pinned, pinned === "true"));
  }

  if (search) {
    const term = `%${search}%`;
    // Case-insensitive search across name/description.
    const searchFilter = or(ilike(projects.name, term), ilike(projects.description, term));
    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  // Aggregate receipt counts per project (excluding soft-deleted receipts)
  const receiptCounts = db
    .select({
      projectId: receipts.projectId,
      receiptCount: sql<number>`count(*)`.as("receiptCount"),
    })
    .from(receipts)
    .where(and(eq(receipts.userId, userId), isNull(receipts.deletedAt)))
    .groupBy(receipts.projectId)
    .as("receipt_counts");

  const t1 = Date.now();
  const data = await db
    .select({
      projectId: projects.projectId,
      userId: projects.userId,
      name: projects.name,
      description: projects.description,
      pinned: projects.pinned,
      archived: projects.archived,
      tags: projects.tags,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      receiptCount: sql<number>`coalesce(${receiptCounts.receiptCount}, 0)`.as(
        "receiptCount"
      ),
    })
    .from(projects)
    .leftJoin(receiptCounts, eq(receiptCounts.projectId, projects.projectId))
    // Avoid returning projects with empty names—these are considered invalid drafts.
    .where(and(...filters, sql`nullif(${projects.name}, '') is not null`))
    .orderBy(desc(projects.pinned), desc(projects.updatedAt));

  console.log(`[projects] [DB] 查询项目列表耗时: ${Date.now() - t1}ms - 返回 ${data.length} 条, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, data);
});

router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = projectCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const t1 = Date.now();
  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: body.data.name,
      description: body.data.description,
      pinned: body.data.pinned ?? false,
      tags: body.data.tags ?? [],
    })
    .returning();

  console.log(`[projects] [DB] 创建项目耗时: ${Date.now() - t1}ms`);

  return ok(c, project);
});

router.patch(":projectId", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = projectUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [project] = await db
    .update(projects)
    .set({
      ...body.data,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)))
    .returning();

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return ok(c, project);
});

router.post(":projectId/archive", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const [project] = await db
    .update(projects)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)))
    .returning();

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return ok(c, project);
});

router.delete(":projectId", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");

  // 检查项目是否存在
  let t1 = Date.now();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.projectId, projectId), eq(projects.userId, userId)));
  console.log(`[projects] [DB] 查询项目耗时: ${Date.now() - t1}ms`);

  if (!project) {
    return errorResponse(c, 404, "PROJECT_NOT_FOUND", "Project not found");
  }

  // 检查项目下是否有数据
  t1 = Date.now();
  const [expenseCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(eq(expenses.projectId, projectId));
  console.log(`[projects] [DB] 查询费用数量耗时: ${Date.now() - t1}ms - ${expenseCount?.count ?? 0} 条`);

  t1 = Date.now();
  const [receiptCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(receipts)
    .where(and(eq(receipts.projectId, projectId), isNull(receipts.deletedAt)));
  console.log(`[projects] [DB] 查询票据数量耗时: ${Date.now() - t1}ms - ${receiptCount?.count ?? 0} 张`);

  t1 = Date.now();
  const [batchCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(batches)
    .where(eq(batches.projectId, projectId));
  console.log(`[projects] [DB] 查询导出数量耗时: ${Date.now() - t1}ms - ${batchCount?.count ?? 0} 个`);

  const hasData =
    (expenseCount?.count ?? 0) > 0 ||
    (receiptCount?.count ?? 0) > 0 ||
    (batchCount?.count ?? 0) > 0;

  if (hasData) {
    return errorResponse(
      c,
      400,
      "PROJECT_HAS_DATA",
      "Cannot delete project with existing data. Please delete all expenses, receipts, and exports first."
    );
  }

  // 删除项目
  t1 = Date.now();
  await db.delete(projects).where(eq(projects.projectId, projectId));
  console.log(`[projects] [DB] 删除项目耗时: ${Date.now() - t1}ms, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, { success: true });
});

export default router;
