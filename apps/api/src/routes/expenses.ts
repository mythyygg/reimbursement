/**
 * 支出（Expense）API 路由
 *
 * 这个文件定义了所有与支出相关的 HTTP 接口：
 * - GET /projects/:projectId/expenses - 获取项目下的支出列表
 * - POST /projects/:projectId/expenses - 创建新支出
 * - GET /expenses/:expenseId - 获取单个支出详情
 * - PATCH /expenses/:expenseId - 更新支出信息
 * - DELETE /expenses/:expenseId - 删除支出
 *
 * 技术栈说明：
 * - Hono: 轻量级 Web 框架（类似 Express，但更快）
 * - Zod: 数据验证库（类似 Joi，但类型安全更好）
 * - Drizzle ORM: 数据库操作工具（类似 TypeORM）
 */

// Hono 是一个轻量级的 Web 框架，用于处理 HTTP 请求
import { Hono } from "hono";

// Zod 是一个数据验证库，用于验证请求参数的格式
import { z } from "zod";

// Drizzle ORM 的查询构建器
// - and: SQL 的 AND 条件
// - eq: SQL 的 = 运算符
// - gte: SQL 的 >= 运算符（greater than or equal）
// - lte: SQL 的 <= 运算符（less than or equal）
// - isNull: SQL 的 IS NULL
import { and, eq, gte, isNull, lte } from "drizzle-orm";

// 导入数据库表定义（schema）
import {
  expenseReceipts,  // 支出-票据关联表
  expenses,          // 支出表
  receipts,          // 票据表
  settings,          // 用户设置表
} from "@reimbursement/shared/db";

// 工具函数
import { daysBetween, parseDate } from "@reimbursement/shared/utils";

// 数据库客户端
import { db } from "../db/client.js";

// 认证中间件（验证用户登录状态）
import { authMiddleware } from "../middleware/auth.js";

// HTTP 响应工具函数
import { errorResponse, ok } from "../utils/http.js";

/**
 * 创建路由器
 * Hono 的路由器类似于 Express 的 Router
 */
const router = new Hono();

/**
 * TypeScript 类型定义
 * $inferSelect 是 Drizzle 自动生成的类型，表示从数据库查询出来的数据结构
 */
type ReceiptRow = typeof receipts.$inferSelect;

/**
 * 票据候选匹配的数据结构
 * 用于推荐可能匹配的票据
 */
type ReceiptCandidate = {
  receiptId: string;   // 票据 ID
  confidence: string;  // 置信度（high/medium/low）
  reason: string;      // 推荐理由
  score: number;       // 匹配分数（用于排序）
};

/**
 * Zod Schema - 创建支出的请求体验证规则
 *
 * Zod 的作用：
 * - 验证前端传来的数据格式是否正确
 * - 自动生成 TypeScript 类型
 * - 提供友好的错误提示
 */
const expenseCreateSchema = z.object({
  amount: z.number().positive(),                   // 金额：必须是正数
  note: z.string().min(1),                         // 备注：至少1个字符
  date: z.string().datetime().optional(),          // 日期：可选，ISO 8601 格式
  category: z.string().optional(),                 // 类别：可选
  status: z                                        // 状态：可选，只能是这三个值之一
    .enum(["pending", "processing", "completed"])
    .optional(),
  client_request_id: z.string().optional(),        // 客户端请求 ID：用于防止重复提交
});

/**
 * Zod Schema - 更新支出的请求体验证规则
 * 所有字段都是可选的，因为更新时可能只修改部分字段
 */
const expenseUpdateSchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().min(1).optional(),
  date: z.string().datetime().optional(),
  category: z.string().optional().nullable(),      // nullable 表示可以设置为 null
  status: z
    .enum(["pending", "processing", "completed"])
    .optional(),
});

/**
 * 全局中间件：所有路由都需要认证
 * authMiddleware 会验证 JWT token，并将用户信息注入到 context 中
 */
router.use("*", authMiddleware);

/**
 * GET /projects/:projectId/expenses
 * 获取项目下的支出列表，支持多种筛选条件
 *
 * 查询参数（Query Parameters）：
 * - status: 按状态筛选（pending/processing/completed）
 * - category: 按类别筛选
 * - date_from: 开始日期
 * - date_to: 结束日期
 *
 * 响应示例：
 * [
 *   {
 *     "expenseId": "abc-123",
 *     "amount": "150.50",
 *     "note": "打车费",
 *     "date": "2023-12-27T10:00:00Z",
 *     ...
 *   }
 * ]
 */
router.get("/projects/:projectId/expenses", async (c) => {
  const startTime = Date.now();
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const status = c.req.query("status");
  const category = c.req.query("category");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");

  // Allow caller to filter by status/category/date ranges; default is all expenses in project.
  const filters = [
    eq(expenses.userId, userId),
    eq(expenses.projectId, projectId),
  ];

  if (status) {
    filters.push(eq(expenses.status, status));
  }
  if (category) {
    filters.push(eq(expenses.category, category));
  }
  if (dateFrom) {
    filters.push(gte(expenses.date, new Date(dateFrom)));
  }
  if (dateTo) {
    filters.push(lte(expenses.date, new Date(dateTo)));
  }

  const t1 = Date.now();
  const data = await db
    .select()
    .from(expenses)
    .where(and(...filters))
    .orderBy(expenses.date, expenses.createdAt);

  console.log(`[expenses] [DB] 查询费用列表耗时: ${Date.now() - t1}ms - 返回 ${data.length} 条, 总耗时: ${Date.now() - startTime}ms`);

  return ok(c, data);
});

router.post("/projects/:projectId/expenses", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = expenseCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  if (body.data.client_request_id) {
    // Idempotency: reuse existing row if same client_request_id in project/user.
    const existing = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.projectId, projectId),
          eq(expenses.clientRequestId, body.data.client_request_id)
        )
      );

    if (existing.length > 0) {
      return ok(c, existing[0]);
    }
  }

  const now = new Date();
  const date = body.data.date ? new Date(body.data.date) : now;
  const status = body.data.status ?? "pending";
  // manualStatus flags user-forced states like "completed" to skip auto transitions.
  const manualStatus = status === "completed";

  const [expense] = await db
    .insert(expenses)
    .values({
      userId,
      projectId,
      amount: String(body.data.amount),
      note: body.data.note,
      date,
      category: body.data.category,
      status,
      manualStatus,
      clientRequestId: body.data.client_request_id,
    })
    .returning();

  return ok(c, expense);
});

router.patch("/expenses/:expenseId", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");
  const body = expenseUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.amount !== undefined) {
    update.amount = String(body.data.amount);
  }
  if (body.data.note !== undefined) {
    update.note = body.data.note;
  }
  if (body.data.date !== undefined) {
    update.date = new Date(body.data.date);
  }
  if (body.data.category !== undefined) {
    update.category = body.data.category;
  }
  if (body.data.status !== undefined) {
    update.status = body.data.status;
    // Keep manual flag in sync with explicit "completed".
    update.manualStatus = body.data.status === "completed";
  }

  const [expense] = await db
    .update(expenses)
    .set(update)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)))
    .returning();

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  return ok(c, expense);
});

router.delete("/expenses/:expenseId", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");

  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(receipts)
      .set({ matchedExpenseId: null, updatedAt: new Date() })
      .where(eq(receipts.matchedExpenseId, expenseId));

    await tx
      .delete(expenseReceipts)
      .where(eq(expenseReceipts.expenseId, expenseId));

    await tx
      .delete(expenses)
      .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));
  });

  return ok(c, { success: true });
});

router.get("/expenses/:expenseId/receipts", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");
  const data = await db
    .select()
    .from(receipts)
    .where(
      and(eq(receipts.userId, userId), eq(receipts.matchedExpenseId, expenseId))
    );

  return ok(c, data);
});

router.get("/expenses/:expenseId/receipt-candidates", async (c) => {
  const { userId } = c.get("auth");
  const expenseId = c.req.param("expenseId");

  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  const [userSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId));

  const rules = {
    dateWindowDays: Number(userSettings?.matchRulesJson?.dateWindowDays ?? 3),
    amountTolerance: Number(userSettings?.matchRulesJson?.amountTolerance ?? 0),
    requireCategoryMatch: Boolean(
      userSettings?.matchRulesJson?.requireCategoryMatch ?? false
    ),
  };

  const receiptRows = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.userId, userId),
        eq(receipts.projectId, expense.projectId),
        isNull(receipts.deletedAt)
      )
    );

  const candidates = receiptRows
    // Only consider free receipts or the one already matched to this expense.
    .filter(
      (receipt: ReceiptRow) =>
        !receipt.matchedExpenseId ||
        receipt.matchedExpenseId === expense.expenseId
    )
    .map((receipt: ReceiptRow) => {
      const receiptAmount = receipt.receiptAmount
        ? Number(receipt.receiptAmount)
        : null;
      const receiptDate = receipt.receiptDate;
      if (!receiptAmount || !receiptDate) {
        return null;
      }
      const amountDiff = Math.abs(Number(expense.amount) - receiptAmount);
      if (amountDiff > rules.amountTolerance) {
        return null;
      }
      const dateDiff = Math.abs(
        daysBetween(
          parseDate(expense.date) ?? new Date(),
          parseDate(receiptDate) ?? new Date()
        )
      );
      const categoryMatch =
        !rules.requireCategoryMatch ||
        !expense.category ||
        !receipt.receiptType ||
        expense.category === receipt.receiptType;
      // Heuristic confidence: prioritize near-date matches; category adds a small boost.
      const confidence =
        dateDiff <= 1 && categoryMatch
          ? "high"
          : dateDiff <= 3
            ? "medium"
            : "low";
      return {
        receiptId: receipt.receiptId,
        confidence,
        reason: `date+/-${dateDiff}d${categoryMatch ? " + category" : ""}`,
        score: 10 - Math.min(dateDiff, 10) + (categoryMatch ? 2 : 0),
      };
    })
    .filter((value): value is ReceiptCandidate => value !== null)
    .sort((a: ReceiptCandidate, b: ReceiptCandidate) => b.score - a.score)
    .slice(0, 3)
    .map(({ receiptId, confidence, reason }: ReceiptCandidate) => ({
      receiptId,
      confidence,
      reason,
    }));

  return ok(c, candidates);
});

export default router;
