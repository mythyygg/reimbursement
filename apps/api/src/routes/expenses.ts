import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import {
  expenseReceipts,
  expenses,
  receipts,
  settings,
} from "@reimbursement/shared/db";
import { daysBetween, parseDate } from "@reimbursement/shared/utils";
import { db } from "../db/client.js";
import { authMiddleware } from "../middleware/auth.js";
import { errorResponse, ok } from "../utils/http.js";

const router = new Hono();
type ReceiptRow = typeof receipts.$inferSelect;
type ReceiptCandidate = {
  receiptId: string;
  confidence: string;
  reason: string;
  score: number;
};

const expenseCreateSchema = z.object({
  amount: z.number().positive(),
  note: z.string().min(1),
  date: z.string().datetime().optional(),
  category: z.string().optional(),
  status: z
    .enum(["missing_receipt", "matched", "no_receipt_required"])
    .optional(),
  client_request_id: z.string().optional(),
});

const expenseUpdateSchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().min(1).optional(),
  date: z.string().datetime().optional(),
  category: z.string().optional().nullable(),
  status: z
    .enum(["missing_receipt", "matched", "no_receipt_required"])
    .optional(),
});

router.use("*", authMiddleware);

router.get("/projects/:projectId/expenses", async (c) => {
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

  const data = await db
    .select()
    .from(expenses)
    .where(and(...filters))
    .orderBy(expenses.date, expenses.createdAt);

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
  const status = body.data.status ?? "missing_receipt";
  // manualStatus flags user-forced states like "no_receipt_required" to skip auto transitions.
  const manualStatus = status === "no_receipt_required";

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
    // Keep manual flag in sync with explicit "no_receipt_required".
    update.manualStatus = body.data.status === "no_receipt_required";
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
        : receipt.ocrAmount
        ? Number(receipt.ocrAmount)
        : null;
      const receiptDate = receipt.receiptDate ?? receipt.ocrDate;
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
