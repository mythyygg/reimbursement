import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  batchIssues,
  batches,
  expenses,
  receipts,
} from "@reimbursement/shared/db";
import { db } from "../../db/client.js";

export async function processBatchCheckJob(input: {
  batchId: string;
  userId: string;
}) {
  const [batch] = await db
    .select()
    .from(batches)
    .where(
      and(eq(batches.batchId, input.batchId), eq(batches.userId, input.userId))
    );

  if (!batch) {
    return;
  }

  const filter = (batch.filterJson ?? {}) as {
    dateFrom?: string;
    dateTo?: string;
    statuses?: string[];
    categories?: string[];
  };

  const expenseFilters = [
    eq(expenses.userId, input.userId),
    eq(expenses.projectId, batch.projectId),
  ];

  if (filter.statuses && filter.statuses.length > 0) {
    expenseFilters.push(inArray(expenses.status, filter.statuses));
  }
  if (filter.categories && filter.categories.length > 0) {
    expenseFilters.push(inArray(expenses.category, filter.categories));
  }
  if (filter.dateFrom) {
    expenseFilters.push(gte(expenses.date, new Date(filter.dateFrom)));
  }
  if (filter.dateTo) {
    expenseFilters.push(lte(expenses.date, new Date(filter.dateTo)));
  }

  const expenseRows = await db
    .select()
    .from(expenses)
    .where(and(...expenseFilters));

  const receiptRows = await db
    .select()
    .from(receipts)
    .where(
      and(
        eq(receipts.projectId, batch.projectId),
        eq(receipts.userId, input.userId),
        isNull(receipts.deletedAt)
      )
    );

  const receiptsByExpense = new Map<string, typeof receiptRows>();
  for (const receipt of receiptRows) {
    if (!receipt.matchedExpenseId) {
      continue;
    }
    const list = receiptsByExpense.get(receipt.matchedExpenseId) ?? [];
    list.push(receipt);
    receiptsByExpense.set(receipt.matchedExpenseId, list);
  }

  const issues: Array<{
    type: string;
    severity: string;
    expenseId?: string;
    receiptId?: string;
    message: string;
  }> = [];

  for (const expense of expenseRows) {
    const linked = receiptsByExpense.get(expense.expenseId) ?? [];
    if (linked.length === 0 || expense.status === "pending") {
      issues.push({
        type: "missing_receipt",
        severity: "warning",
        expenseId: expense.expenseId,
        message: "Missing receipt",
      });
    }

    for (const receipt of linked) {
      const compareAmount = receipt.receiptAmount;
      if (compareAmount) {
        const mismatch = Number(compareAmount) !== Number(expense.amount);
        if (mismatch) {
          issues.push({
            type: "amount_mismatch",
            severity: "warning",
            expenseId: expense.expenseId,
            receiptId: receipt.receiptId,
            message: "Receipt amount mismatch",
          });
        }
      }
    }
  }

  const eligibleExpenseIds = new Set(
    expenseRows.map((expense) => expense.expenseId)
  );
  const duplicateMap = new Map<string, typeof receiptRows>();
  for (const receipt of receiptRows) {
    if (!receipt.hash) {
      continue;
    }
    if (
      !receipt.matchedExpenseId ||
      !eligibleExpenseIds.has(receipt.matchedExpenseId)
    ) {
      continue;
    }
    const list = duplicateMap.get(receipt.hash) ?? [];
    list.push(receipt);
    duplicateMap.set(receipt.hash, list);
  }

  for (const [hash, group] of duplicateMap.entries()) {
    if (group.length < 2) {
      continue;
    }
    for (const receipt of group) {
      issues.push({
        type: "duplicate_receipt",
        severity: "warning",
        expenseId: receipt.matchedExpenseId ?? undefined,
        receiptId: receipt.receiptId,
        message: `Duplicate receipt hash ${hash}`,
      });
    }
  }

  await db.delete(batchIssues).where(eq(batchIssues.batchId, batch.batchId));

  if (issues.length > 0) {
    await db.insert(batchIssues).values(
      issues.map((issue) => ({
        batchId: batch.batchId,
        type: issue.type,
        severity: issue.severity,
        expenseId: issue.expenseId,
        receiptId: issue.receiptId,
        message: issue.message,
      }))
    );
  }

  const summary = {
    missing_receipt: issues.filter((issue) => issue.type === "missing_receipt")
      .length,
    duplicate_receipt: issues.filter(
      (issue) => issue.type === "duplicate_receipt"
    ).length,
    amount_mismatch: issues.filter((issue) => issue.type === "amount_mismatch")
      .length,
  };

  await db
    .update(batches)
    .set({ issueSummaryJson: summary, updatedAt: new Date() })
    .where(eq(batches.batchId, batch.batchId));
}
