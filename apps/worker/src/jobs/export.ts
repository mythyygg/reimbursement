/**
 * 导出任务处理器 - Export Job
 *
 * 功能：将批次中的支出和票据导出为 ZIP 压缩包
 *
 * 导出内容包括：
 * 1. CSV 文件：支出清单（金额、日期、备注等）
 * 2. 票据图片/PDF：所有关联的票据文件
 * 3. PDF 汇总页（可选）：索引页，方便查看所有票据
 *
 * 处理流程：
 * 1. 从数据库获取批次信息和筛选条件
 * 2. 查询符合条件的支出和票据
 * 3. 生成 CSV 文件
 * 4. 从对象存储下载所有票据文件
 * 5. 打包成 ZIP 文件
 * 6. 上传 ZIP 到对象存储
 * 7. 更新导出记录状态
 *
 * 为什么需要 Worker？
 * - 导出过程耗时较长（下载文件、打包等）
 * - 如果在 API 中处理，用户需要等待很久
 * - 使用 Worker 后台处理，用户可以继续使用系统
 */

// archiver: 用于创建 ZIP 压缩包的库
import archiver from "archiver";

// pdfkit: 用于生成 PDF 文档的库
import PDFDocument from "pdfkit";

// Node.js 流处理（Stream）
// Stream 是 Node.js 处理大文件的方式，不需要一次性加载到内存
import { PassThrough } from "node:stream";

// Drizzle ORM 的查询构建器
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

// 数据库表定义
import {
  batches,          // 批次表
  exportRecords,    // 导出记录表
  expenses,         // 支出表
  projects,         // 项目表
  receipts,         // 票据表
  settings,         // 用户设置表
} from "@reimbursement/shared/db";

// 工具函数
import {
  buildCsv,              // 构建 CSV 文件内容
  buildReceiptFilename,  // 生成票据文件名（规范化命名）
  formatAmount,          // 格式化金额（如 150.5 → "150.50"）
  formatDate,            // 格式化日期（如 ISO 8601 → "2023-12-27"）
  withUtf8Bom,          // 添加 UTF-8 BOM（防止 Excel 乱码）
} from "@reimbursement/shared/utils";

// 数据库客户端
import { db } from "../db/client";

// 对象存储服务（MinIO/S3）
import { downloadObject, uploadObject } from "../services/storage";

/**
 * 导出条目的数据结构
 * 每个条目包含一个支出和它关联的所有票据
 */
type ExportEntry = {
  sequence: number;      // 序号（1、2、3...）
  expense: typeof expenses.$inferSelect;  // 支出信息
  receipts: Array<{      // 关联的票据列表
    receiptId: string;   // 票据 ID
    filename: string;    // 文件名
    storageKey: string;  // 对象存储中的 Key
  }>;
};

/**
 * 处理导出任务的主函数
 *
 * @param input.exportId - 导出记录 ID
 * @param input.userId - 用户 ID（用于权限验证）
 *
 * 这是一个异步函数，会在后台执行
 * 执行时间可能较长（几秒到几分钟，取决于文件数量和大小）
 */
export async function processExportJob(input: {
  exportId: string;
  userId: string;
}) {
  const [record] = await db
    .select()
    .from(exportRecords)
    .where(
      and(
        eq(exportRecords.exportId, input.exportId),
        eq(exportRecords.userId, input.userId)
      )
    );

  if (!record) {
    return;
  }

  await db
    .update(exportRecords)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(exportRecords.exportId, input.exportId));

  try {
    const projectIds = (record.projectIds ?? []) as string[];
    const isBatchExport = !!record.batchId;

    let batch: typeof batches.$inferSelect | undefined;
    if (isBatchExport && record.batchId) {
      [batch] = await db
        .select()
        .from(batches)
        .where(eq(batches.batchId, record.batchId));
    }

    const projectRows = await db
      .select()
      .from(projects)
      .where(inArray(projects.projectId, projectIds));

    const projectMap = new Map(projectRows.map((p) => [p.projectId, p]));

    const [userSettings] = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, input.userId));

    const template = userSettings?.exportTemplateJson ?? {
      includeMerchantKeyword: false,
      includeExpenseId: false,
      includeReceiptIds: false,
      sortDirection: "asc",
      includePdf: true,
    };

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

    const expenseRows = await db
      .select()
      .from(expenses)
      .where(and(...expenseFilters));

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

    const receiptsByExpense = new Map<string, typeof receiptRows>();
    for (const receipt of receiptRows) {
      if (!receipt.matchedExpenseId) {
        continue;
      }
      const list = receiptsByExpense.get(receipt.matchedExpenseId) ?? [];
      list.push(receipt);
      receiptsByExpense.set(receipt.matchedExpenseId, list);
    }

    const sortedExpenses =
      template.sortDirection === "desc"
        ? [...expenseRows].sort((a, b) => b.date.getTime() - a.date.getTime())
        : [...expenseRows].sort((a, b) => a.date.getTime() - b.date.getTime());

    const entries: ExportEntry[] = [];
    const csvRows: Array<Array<string | number | null>> = [];
    csvRows.push(buildCsvHeader(template));

    sortedExpenses.forEach((expense, index) => {
      const sequence = index + 1;
      const linkedReceipts = receiptsByExpense.get(expense.expenseId) ?? [];
      const receiptNames = linkedReceipts.map((receipt, receiptIndex) =>
        buildReceiptFilename({
          sequence,
          date: expense.date,
          amount: Number(expense.amount),
          category: expense.category ?? "other",
          note: expense.note,
          receiptId: receipt.receiptId,
          extension: receipt.fileExt ?? "bin",
          subIndex: linkedReceipts.length > 1 ? receiptIndex : undefined,
        })
      );

      const exportReceipts = linkedReceipts
        .map((receipt, receiptIndex) => ({
          receiptId: receipt.receiptId,
          filename: receiptNames[receiptIndex],
          storageKey: receipt.storageKey,
        }))
        .filter((entry) => Boolean(entry.storageKey)) as Array<{
          receiptId: string;
          filename: string;
          storageKey: string;
        }>;

      entries.push({ sequence, expense, receipts: exportReceipts });

      csvRows.push(
        buildCsvRow({
          sequence,
          projectLabel: projectMap.get(expense.projectId)?.name ?? "-",
          expense,
          receiptNames,
          template,
          receipts: linkedReceipts,
        })
      );
    });

    const csvBuffer = Buffer.from(withUtf8Bom(buildCsv(csvRows)), "utf-8");

    if (record.type === "csv") {
      await finalizeExport(
        record.exportId,
        csvBuffer,
        "text/csv",
        "csv",
        input.userId
      );
      return;
    }

    if (record.type === "pdf") {
      const pdfBuffer = await buildPdfIndex({
        batchName: batch?.name || "Items Export",
        projectLabel: projectRows.length === 1 ? projectRows[0].name ?? "-" : "Multiple Projects",
        entries,
      });
      await finalizeExport(
        record.exportId,
        pdfBuffer,
        "application/pdf",
        "pdf",
        input.userId
      );
      return;
    }

    const pdfBuffer = template.includePdf
      ? await buildPdfIndex({
        batchName: batch?.name || "Items Export",
        projectLabel: projectRows.length === 1 ? projectRows[0].name ?? "-" : "Multiple Projects",
        entries,
      })
      : null;

    const zipBuffer = await buildZipArchive({ csvBuffer, entries, pdfBuffer });
    await finalizeExport(
      record.exportId,
      zipBuffer,
      "application/zip",
      "zip",
      input.userId
    );
  } catch (error) {
    await db
      .update(exportRecords)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(exportRecords.exportId, input.exportId));
  }
}

function buildCsvHeader(template: Record<string, unknown>) {
  const header = [
    "\u5e8f\u53f7",
    "\u9879\u76ee",
    "\u65e5\u671f",
    "\u91d1\u989d",
    "\u7c7b\u522b",
    "\u4e8b\u9879\u5907\u6ce8",
    "\u72b6\u6001",
    "\u7968\u636e\u6570\u91cf",
    "\u7968\u636e\u6587\u4ef6\u540d\u5217\u8868",
  ];


  if (template.includeMerchantKeyword) {
    header.push("\u5546\u6237\u5173\u952e\u5b57");
  }
  if (template.includeExpenseId) {
    header.push("\u652f\u51faID");
  }
  if (template.includeReceiptIds) {
    header.push("\u7968\u636eID\u5217\u8868");
  }

  return header;
}

function buildCsvRow(input: {
  sequence: number;
  projectLabel: string;
  expense: typeof expenses.$inferSelect;
  receiptNames: string[];
  template: Record<string, unknown>;
  receipts: (typeof receipts.$inferSelect)[];
}) {
  const receiptCount = input.receipts.length;

  const merchantKeywords = input.receipts
    .map((receipt) => receipt.merchantKeyword)
    .filter(Boolean)
    .join(";");

  const row: Array<string | number | null> = [
    String(input.sequence).padStart(3, "0"),
    input.projectLabel,
    formatDate(input.expense.date),
    formatAmount(Number(input.expense.amount)),
    input.expense.category ?? "-",
    input.expense.note,
    mapStatusLabel(input.expense.status),
    receiptCount,
    input.receiptNames.join(";"),
  ];


  if (input.template.includeMerchantKeyword) {
    row.push(merchantKeywords || null);
  }
  if (input.template.includeExpenseId) {
    row.push(input.expense.expenseId);
  }
  if (input.template.includeReceiptIds) {
    row.push(input.receipts.map((receipt) => receipt.receiptId).join(";"));
  }

  return row;
}

function mapStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "新建";
    case "processing":
      return "处理中";
    case "completed":
      return "已报销";
    default:
      return status;
  }
}

async function buildZipArchive(input: {
  csvBuffer: Buffer;
  entries: ExportEntry[];
  pdfBuffer: Buffer | null;
}): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  archive.pipe(stream);

  archive.append(input.csvBuffer, { name: "batch.csv" });
  if (input.pdfBuffer) {
    archive.append(input.pdfBuffer, { name: "index.pdf" });
  }

  for (const entry of input.entries) {
    for (const receipt of entry.receipts) {
      const file = await downloadObject(receipt.storageKey);
      archive.append(file, { name: `receipts/${receipt.filename}` });
    }
  }

  await archive.finalize();

  return new Promise((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
  });
}

async function buildPdfIndex(input: {
  batchName: string;
  projectLabel: string;
  entries: ExportEntry[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  doc.fontSize(16).text(input.batchName, { align: "left" });
  doc.fontSize(10).text(`Project: ${input.projectLabel}`);
  doc.text(`Exported: ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown();

  input.entries.forEach((entry) => {
    const note =
      entry.expense.note.length > 30
        ? `${entry.expense.note.slice(0, 30)}...`
        : entry.expense.note;
    doc.fontSize(10).text(`No. ${String(entry.sequence).padStart(3, "0")}`);
    doc.text(
      `Date: ${formatDate(entry.expense.date)}  Amount: ${formatAmount(
        Number(entry.expense.amount)
      )}`
    );
    doc.text(`Category: ${entry.expense.category ?? "-"}`);
    doc.text(`Note: ${note}`);
    doc.text(`Receipts: ${entry.receipts.map((r) => r.filename).join(", ")}`);
    doc.moveDown(0.5);
  });

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function finalizeExport(
  exportId: string,
  buffer: Buffer,
  contentType: string,
  extension: string,
  userId: string
) {
  const storageKey = `users/${userId}/exports/${exportId}.${extension}`;
  const upload = await uploadObject({ storageKey, body: buffer, contentType });

  await db
    .update(exportRecords)
    .set({
      status: "done",
      storageKey,
      fileUrl: upload.publicUrl,
      fileSize: upload.size,
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(exportRecords.exportId, exportId));
}
