import archiver from "archiver";
import PDFDocument from "pdfkit";
import { PassThrough } from "node:stream";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  batches,
  exportRecords,
  expenses,
  projects,
  receipts,
  settings,
} from "@reimbursement/shared/db";
import {
  buildCsv,
  buildReceiptFilename,
  formatAmount,
  formatDate,
  withUtf8Bom,
} from "@reimbursement/shared/utils";
import { db } from "../db/client";
import { downloadObject, uploadObject } from "../services/storage";

type ExportEntry = {
  sequence: number;
  expense: typeof expenses.$inferSelect;
  receipts: Array<{ receiptId: string; filename: string; storageKey: string }>;
};

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
    const [batch] = await db
      .select()
      .from(batches)
      .where(eq(batches.batchId, record.batchId));

    if (!batch) {
      throw new Error("Batch not found");
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.projectId, batch.projectId));

    const [userSettings] = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, input.userId));

    const template = userSettings?.exportTemplateJson ?? {
      includeOcrAmount: false,
      includeOcrDate: false,
      includeMerchantKeyword: false,
      includeExpenseId: false,
      includeReceiptIds: false,
      sortDirection: "asc",
      includePdf: true,
    };

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
          projectLabel: project?.name ?? "-",
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
        batchName: batch.name,
        projectLabel: project?.name ?? "-",
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
          batchName: batch.name,
          projectLabel: project?.name ?? "-",
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

  if (template.includeOcrAmount) {
    header.push("\u7968\u636eOCR\u91d1\u989d");
  }
  if (template.includeOcrDate) {
    header.push("\u7968\u636eOCR\u65e5\u671f");
  }
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
  const ocrAmounts = input.receipts
    .map((receipt) => receipt.ocrAmount)
    .filter(Boolean)
    .join(";");
  const ocrDates = input.receipts
    .map((receipt) => (receipt.ocrDate ? formatDate(receipt.ocrDate) : null))
    .filter(Boolean)
    .join(";");
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

  if (input.template.includeOcrAmount) {
    row.push(ocrAmounts || null);
  }
  if (input.template.includeOcrDate) {
    row.push(ocrDates || null);
  }
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
    case "missing_receipt":
      return "\u7f3a\u7968";
    case "matched":
      return "\u5df2\u5339\u914d";
    case "no_receipt_required":
      return "\u4e0d\u9700\u7968";
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
