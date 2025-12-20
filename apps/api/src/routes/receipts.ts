import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  expenseReceipts,
  expenses,
  receipts,
  settings,
  uploadSessions,
  downloadLogs,
} from "@reimbursement/shared/db";
import { getReceiptCandidates } from "@reimbursement/shared/utils";
import { db } from "../db/client";
import { authMiddleware } from "../middleware/auth";
import {
  createReceiptUploadUrl,
  createReceiptDownloadUrl,
} from "../services/storage";
import { config } from "../config";
import { errorResponse, ok } from "../utils/http";

const router = new Hono();

const receiptCreateSchema = z.object({
  client_request_id: z.string().optional(),
});

const uploadUrlSchema = z.object({
  file_ext: z.string().min(1),
  content_type: z.string().min(1),
  file_size: z.number().positive(),
});

const completeSchema = z.object({
  hash: z.string().min(6),
});

const receiptUpdateSchema = z.object({
  ocr_amount: z.number().optional(),
  ocr_date: z.string().datetime().optional(),
  merchant_keyword: z.string().optional(),
  receipt_amount: z.number().optional(),
  receipt_date: z.string().datetime().optional(),
  receipt_type: z.string().optional(),
});

const matchSchema = z.object({
  expense_id: z.string().uuid().nullable(),
});

router.use("*", authMiddleware);

router.get("/projects/:projectId/receipts", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const matched = c.req.query("matched");
  const ocrStatus = c.req.query("ocr_status");

  const filters = [
    eq(receipts.userId, userId),
    eq(receipts.projectId, projectId),
    isNull(receipts.deletedAt),
  ];

  if (matched !== undefined) {
    filters.push(
      matched === "true"
        ? sql`${receipts.matchedExpenseId} is not null`
        : sql`${receipts.matchedExpenseId} is null`
    );
  }

  if (ocrStatus) {
    filters.push(eq(receipts.ocrStatus, ocrStatus));
  }

  const data = await db
    .select()
    .from(receipts)
    .where(and(...filters));

  const withSignedUrls = await Promise.all(
    data.map(async (item) => {
      if (item.storageKey) {
        try {
          const signedUrl = await createReceiptDownloadUrl({
            storageKey: item.storageKey,
          });
          return { ...item, fileUrl: signedUrl };
        } catch {
          // fall back silently if signing fails
        }
      }
      return item;
    })
  );

  return ok(c, withSignedUrls);
});

router.post("/projects/:projectId/receipts", async (c) => {
  const { userId } = c.get("auth");
  const projectId = c.req.param("projectId");
  const body = receiptCreateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  if (body.data.client_request_id) {
    const existing = await db
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.userId, userId),
          eq(receipts.projectId, projectId),
          eq(receipts.clientRequestId, body.data.client_request_id)
        )
      );
    if (existing.length > 0) {
      return ok(c, existing[0]);
    }
  }

  const [receipt] = await db
    .insert(receipts)
    .values({
      userId,
      projectId,
      clientRequestId: body.data.client_request_id,
      uploadStatus: "pending",
      ocrStatus: "pending",
    })
    .returning();

  console.log("[api][receipt][create] pending", {
    receiptId: receipt.receiptId,
    userId,
    projectId,
  });
  return ok(c, receipt);
});

router.post("/receipts/:receiptId/upload-url", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = uploadUrlSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  const upload = await createReceiptUploadUrl({
    userId,
    projectId: receipt.projectId,
    receiptId,
    extension: body.data.file_ext,
    contentType: body.data.content_type,
  });

  await db
    .update(receipts)
    .set({
      fileExt: body.data.file_ext,
      fileSize: body.data.file_size,
      storageKey: upload.storageKey,
      uploadStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(receipts.receiptId, receiptId));

  await db.insert(uploadSessions).values({
    receiptId,
    userId,
    signedUrl: upload.signedUrl,
    expireAt: new Date(Date.now() + 15 * 60 * 1000),
    storageKey: upload.storageKey,
    contentType: body.data.content_type,
    maxSize: body.data.file_size,
    status: "created",
  });

  return ok(c, { signed_url: upload.signedUrl, public_url: upload.publicUrl });
});

router.post("/receipts/:receiptId/complete", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = completeSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  const duplicate = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.projectId, receipt.projectId),
        eq(receipts.hash, body.data.hash),
        isNull(receipts.deletedAt)
      )
    );

  const [userSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId));

  const ocrEnabled = userSettings?.ocrEnabled ?? true;

  const fileUrl = receipt.storageKey
    ? `${config.s3PublicBaseUrl}/${receipt.storageKey}`
    : receipt.fileUrl;

  const [updated] = await db
    .update(receipts)
    .set({
      hash: body.data.hash,
      fileUrl,
      uploadStatus: "uploaded",
      duplicateFlag: duplicate.length > 0,
      ocrStatus: ocrEnabled ? "pending" : "disabled",
      updatedAt: new Date(),
    })
    .where(eq(receipts.receiptId, receiptId))
    .returning();

  const projectId = receipt.projectId;
  console.log("[api][receipt][complete]", {
    receiptId,
    userId,
    projectId,
    ocrStatus: updated?.ocrStatus,
    storageKey: updated?.storageKey,
  });

  await db
    .update(uploadSessions)
    .set({ status: "completed" })
    .where(eq(uploadSessions.receiptId, receiptId));

  if (!updated) {
    return errorResponse(c, 500, "UPLOAD_NOT_COMPLETE", "Receipt not updated");
  }

  // 后端 OCR 已移除，依赖前端自动 OCR，状态变更仅在前端触发。
  console.log("[api][receipt][ocr-skip-backend]", {
    receiptId,
    reason: "backend_ocr_removed",
  });

  return ok(c, updated);
});

router.patch("/receipts/:receiptId", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = receiptUpdateSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.ocr_amount !== undefined) {
    update.ocrAmount = String(body.data.ocr_amount);
    update.ocrStatus = "ready";
    update.ocrSource = "frontend";
  }
  if (body.data.ocr_date !== undefined) {
    update.ocrDate = new Date(body.data.ocr_date);
    update.ocrStatus = "ready";
    update.ocrSource = "frontend";
  }
  if (body.data.merchant_keyword !== undefined) {
    update.merchantKeyword = body.data.merchant_keyword;
  }
  if (body.data.receipt_amount !== undefined) {
    update.receiptAmount = String(body.data.receipt_amount);
  }
  if (body.data.receipt_date !== undefined) {
    update.receiptDate = new Date(body.data.receipt_date);
  }
  if (body.data.receipt_type !== undefined) {
    update.receiptType = body.data.receipt_type;
  }

  const [receipt] = await db
    .update(receipts)
    .set(update)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)))
    .returning();

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  return ok(c, receipt);
});

router.patch("/receipts/:receiptId/match", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");
  const body = matchSchema.safeParse(await c.req.json());
  if (!body.success) {
    return errorResponse(c, 400, "INVALID_INPUT", "Invalid input");
  }

  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  if (body.data.expense_id === null) {
    await db.transaction(async (tx) => {
      if (receipt.matchedExpenseId) {
        await tx
          .delete(expenseReceipts)
          .where(eq(expenseReceipts.receiptId, receiptId));
        await tx
          .update(receipts)
          .set({ matchedExpenseId: null, updatedAt: new Date() })
          .where(eq(receipts.receiptId, receiptId));
        const [expense] = await tx
          .select()
          .from(expenses)
          .where(eq(expenses.expenseId, receipt.matchedExpenseId));
        if (expense && !expense.manualStatus) {
          const remaining = await tx
            .select()
            .from(expenseReceipts)
            .where(eq(expenseReceipts.expenseId, expense.expenseId));
          if (remaining.length === 0) {
            await tx
              .update(expenses)
              .set({ status: "missing_receipt", updatedAt: new Date() })
              .where(eq(expenses.expenseId, expense.expenseId));
          }
        }
      }
    });

    return ok(c, { success: true });
  }

  const expenseId = body.data.expense_id;
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.expenseId, expenseId), eq(expenses.userId, userId)));

  if (!expense) {
    return errorResponse(c, 404, "EXPENSE_NOT_FOUND", "Expense not found");
  }

  try {
    await db.transaction(async (tx) => {
      const [freshReceipt] = await tx
        .select()
        .from(receipts)
        .where(eq(receipts.receiptId, receiptId));

      if (
        freshReceipt?.matchedExpenseId &&
        freshReceipt.matchedExpenseId !== expenseId
      ) {
        throw new Error("RECEIPT_ALREADY_MATCHED");
      }

      await tx
        .delete(expenseReceipts)
        .where(eq(expenseReceipts.receiptId, receiptId));
      await tx.insert(expenseReceipts).values({ expenseId, receiptId });
      await tx
        .update(receipts)
        .set({ matchedExpenseId: expenseId, updatedAt: new Date() })
        .where(eq(receipts.receiptId, receiptId));

      if (!expense.manualStatus) {
        await tx
          .update(expenses)
          .set({ status: "matched", updatedAt: new Date() })
          .where(eq(expenses.expenseId, expenseId));
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_ALREADY_MATCHED") {
      return errorResponse(
        c,
        409,
        "RECEIPT_ALREADY_MATCHED",
        "Receipt already matched"
      );
    }
    throw error;
  }

  return ok(c, { success: true });
});

router.get("/receipts/:receiptId/candidates", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");

  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
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

  // 候选：同项目下缺少票据的报销单，外加当前已关联的报销单（避免 matched 状态被排除）。
  const expenseRows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.projectId, receipt.projectId)
      )
    );

  const candidates = getReceiptCandidates(
    {
      amount: receipt.receiptAmount
        ? Number(receipt.receiptAmount)
        : receipt.ocrAmount
        ? Number(receipt.ocrAmount)
        : null,
      date: receipt.receiptDate ?? receipt.ocrDate,
      category: receipt.receiptType,
      note: receipt.merchantKeyword,
    },
    expenseRows.map((expense) => ({
      expenseId: expense.expenseId,
      amount: Number(expense.amount),
      date: expense.date,
      category: expense.category,
      note: expense.note,
    })),
    rules
  );

  const expenseById = new Map(
    expenseRows.map((expense) => [expense.expenseId, expense])
  );

  // 增强候选数据，附带备注/金额/日期，方便前端展示人类可读的选项。
  // 如果票据已关联某报销单，把该报销单放入候选，避免下拉为空。
  let matchedExpense = null;
  if (receipt.matchedExpenseId) {
    const [found] = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.expenseId, receipt.matchedExpenseId),
          eq(expenses.userId, userId)
        )
      );
    matchedExpense = found ?? null;
  }

  const responseCandidates =
    candidates.length > 0
      ? candidates.map((candidate) => {
          const expense = expenseById.get(candidate.expenseId);
          return {
            ...candidate,
            note: expense?.note ?? null,
            amount: expense ? Number(expense.amount) : null,
            date: expense?.date ?? null,
            status: expense?.status ?? null,
          };
        })
      : expenseRows.map((expense) => ({
          expenseId: expense.expenseId,
          confidence: "high",
          reason: "manual selection",
          note: expense.note,
          amount: Number(expense.amount),
          date: expense.date,
          status: expense.status,
        }));

  if (
    matchedExpense &&
    !responseCandidates.some(
      (item) => item.expenseId === matchedExpense!.expenseId
    )
  ) {
    responseCandidates.unshift({
      expenseId: matchedExpense.expenseId,
      confidence: "high",
      reason: "already matched",
      note: matchedExpense.note,
      amount: Number(matchedExpense.amount),
      date: matchedExpense.date,
      status: matchedExpense.status,
    });
  }

  return ok(c, responseCandidates);
});

router.delete("/receipts/:receiptId", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");

  const [receipt] = await db
    .update(receipts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)))
    .returning();

  if (!receipt) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  return ok(c, { success: true });
});

router.post("/receipts/:receiptId/download-url", async (c) => {
  const { userId } = c.get("auth");
  const receiptId = c.req.param("receiptId");

  const [receipt] = await db
    .select()
    .from(receipts)
    .where(and(eq(receipts.receiptId, receiptId), eq(receipts.userId, userId)));

  if (!receipt || !receipt.storageKey) {
    return errorResponse(c, 404, "RECEIPT_NOT_FOUND", "Receipt not found");
  }

  const signedUrl = await createReceiptDownloadUrl({
    storageKey: receipt.storageKey,
  });
  await db.insert(downloadLogs).values({
    userId,
    fileType: "receipt",
    fileId: receipt.receiptId,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
  });

  return ok(c, { signed_url: signedUrl });
});

export default router;
