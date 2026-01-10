import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  batches,
  exportRecords,
  expenses,
  projects,
  receipts,
  settings,
} from "../db/index.js";
import { buildReceiptFilename } from "../utils/index.js";
import { db } from "../db/client.js";
import { uploadObject } from "./services/storage.js";
import { buildHtmlExport } from "./html-export.js";

export async function processExportJob(input: {
  exportId: string;
  userId: string;
}) {
  const jobStartTime = Date.now();
  console.log(
    `[export] ========== 开始处理导出任务: ${input.exportId} ==========`
  );

  let t1 = Date.now();
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, input.exportId),
        eq(exportRecords.userId, input.userId)
      )
    );
  console.log(`[export] [DB] 查询导出记录耗时: ${Date.now() - t1}ms`);

  if (!record) {
    console.log(`[export] 导出记录不存在: ${input.exportId}`);
    return;
  }

  console.log(`[export] 导出类型: ${record.type}, 批次ID: ${record.batchId || "无"}`);

  t1 = Date.now();
  await db
    .update(exportRecords)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(exportRecords.exportId, input.exportId));
  console.log(`[export] [DB] 更新状态为running耗时: ${Date.now() - t1}ms`);

  try {
    const projectIds = (record.projectIds ?? []) as string[];

    console.log(`[export] 项目IDs: ${projectIds.join(", ")}`);

    // Query batch info
    let batch: typeof batches.$inferSelect | undefined;
    if (record.batchId) {
      t1 = Date.now();
      [batch] = await db
        .select()
        .from(batches)
        .where(eq(batches.batchId, record.batchId));
      console.log(
        `[export] [DB] 查询批次信息耗时: ${Date.now() - t1}ms - ${batch?.name}`
      );
    }

    // Query project info
    t1 = Date.now();
    const projectRows = await db
      .select()
      .from(projects)
      .where(inArray(projects.projectId, projectIds));
    console.log(
      `[export] [DB] 查询项目信息耗时: ${Date.now() - t1}ms - 找到 ${projectRows.length} 个项目`
    );

    // Query user settings
    t1 = Date.now();
    const [userSettings] = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, input.userId));
    console.log(`[export] [DB] 查询用户设置耗时: ${Date.now() - t1}ms`);

    const template = userSettings?.exportTemplateJson ?? {
      sortDirection: "asc",
    };

    // Build expense filters
    const filter = (batch?.filterJson ?? {}) as {
      dateFrom?: string;
      dateTo?: string;
      statuses?: string[];
      categories?: string[];
    };

    const expenseFilters = [
      eq(expenses.userId, input.userId),
      inArray(expenses.projectId, projectIds),
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

    // Query expenses
    console.log(`[export] 开始查询费用数据...`);
    t1 = Date.now();

    const expenseRows = await db
      .select()
      .from(expenses)
      .where(and(...expenseFilters));

    console.log(
      `[export] [DB] 查询费用记录耗时: ${Date.now() - t1}ms - 找到 ${expenseRows.length} 条`
    );

    // Query receipts
    t1 = Date.now();
    const receiptRows = await db
      .select()
      .from(receipts)
      .where(
        and(
          inArray(receipts.projectId, projectIds),
          eq(receipts.userId, input.userId),
          isNull(receipts.deletedAt)
        )
      );

    console.log(
      `[export] [DB] 查询票据记录耗时: ${Date.now() - t1}ms - 找到 ${receiptRows.length} 张`
    );

    // Group receipts by expense
    const receiptsByExpense = new Map<string, typeof receiptRows>();
    for (const receipt of receiptRows) {
      if (!receipt.matchedExpenseId) {
        continue;
      }
      const list = receiptsByExpense.get(receipt.matchedExpenseId) ?? [];
      list.push(receipt);
      receiptsByExpense.set(receipt.matchedExpenseId, list);
    }

    // Sort expenses
    const sortedExpenses =
      template.sortDirection === "desc"
        ? [...expenseRows].sort((a, b) => b.date.getTime() - a.date.getTime())
        : [...expenseRows].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Build export entries
    console.log(`[export] 开始构建导出数据...`);
    t1 = Date.now();

    const entries = sortedExpenses.map((expense, index) => {
      const sequence = index + 1;
      const linkedReceipts = receiptsByExpense.get(expense.expenseId) ?? [];

      const exportReceipts = linkedReceipts
        .map((receipt, receiptIndex) => ({
          receiptId: receipt.receiptId,
          filename: buildReceiptFilename({
            sequence,
            date: expense.date,
            amount: Number(expense.amount),
            category: expense.category ?? "other",
            note: expense.note,
            receiptId: receipt.receiptId,
            extension: receipt.fileExt ?? "bin",
            subIndex: linkedReceipts.length > 1 ? receiptIndex : undefined,
          }),
          storageKey: receipt.storageKey,
          fileExt: receipt.fileExt ?? "bin",
        }))
        .filter((entry) => Boolean(entry.storageKey)) as Array<{
        receiptId: string;
        filename: string;
        storageKey: string;
        fileExt: string;
      }>;

      return {
        sequence,
        date: expense.date,
        amount: Number(expense.amount),
        category: expense.category,
        note: expense.note,
        status: expense.status,
        receipts: exportReceipts,
      };
    });

    console.log(
      `[export] 导出数据构建完成, 耗时: ${Date.now() - t1}ms - 共 ${entries.length} 条记录`
    );

    // Generate HTML report
    console.log(`[export] 开始生成HTML报告...`);
    t1 = Date.now();

    const htmlBuffer = await buildHtmlExport({
      batchName: batch?.name || "费用导出",
      projectName:
        projectRows.length === 1
          ? projectRows[0].name ?? "未命名项目"
          : `${projectRows.length} 个项目`,
      createdAt: record.createdAt,
      entries,
    });

    console.log(
      `[export] HTML报告生成完成, 耗时: ${Date.now() - t1}ms - 大小: ${(htmlBuffer.length / 1024).toFixed(2)}KB`
    );

    // Upload to S3
    await finalizeExport(record.exportId, htmlBuffer);

    console.log(
      `[export] ========== HTML导出完成, 总耗时: ${Date.now() - jobStartTime}ms ==========`
    );
  } catch (error) {
    console.error(`[export] 导出失败:`, error);
    await db
      .update(exportRecords)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(exportRecords.exportId, input.exportId));
  }
}

async function finalizeExport(exportId: string, buffer: Buffer) {
  const storageKey = `exports/${exportId}.html`;
  const result = await uploadObject({
    storageKey,
    body: buffer,
    contentType: "text/html",
  });

  await db
    .update(exportRecords)
    .set({
      status: "completed",
      storageKey,
      fileSize: result.size,
      updatedAt: new Date(),
    })
    .where(eq(exportRecords.exportId, exportId));

  console.log(
    `[export] 文件上传完成: ${storageKey} (${(result.size / 1024).toFixed(2)}KB)`
  );
}
