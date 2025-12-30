import archiver from "archiver";
import yaml from "js-yaml";
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
import { db } from "../../db/client.js";
import { downloadObject, uploadObject } from "../services/storage.js";

type ExportEntry = {
  sequence: number;
  expense: typeof expenses.$inferSelect;
  receipts: Array<{
    receiptId: string;
    filename: string;
    storageKey: string;
  }>;
};

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

  console.log(
    `[export] 导出类型: ${record.type}, 批次ID: ${record.batchId || "无"}`
  );

  t1 = Date.now();
  await db
    .update(exportRecords)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(exportRecords.exportId, input.exportId));
  console.log(`[export] [DB] 更新状态为running耗时: ${Date.now() - t1}ms`);

  try {
    const projectIds = (record.projectIds ?? []) as string[];
    const isBatchExport = !!record.batchId;

    console.log(`[export] 项目IDs: ${projectIds.join(", ")}`);

    let batch: typeof batches.$inferSelect | undefined;
    if (isBatchExport && record.batchId) {
      t1 = Date.now();
      [batch] = await db
        .select()
        .from(batches)
        .where(eq(batches.batchId, record.batchId));
      console.log(
        `[export] [DB] 查询批次信息耗时: ${Date.now() - t1}ms - ${batch?.name}`
      );
    }

    t1 = Date.now();
    const projectRows = await db
      .select()
      .from(projects)
      .where(inArray(projects.projectId, projectIds));
    console.log(
      `[export] [DB] 查询项目信息耗时: ${Date.now() - t1}ms - 找到 ${
        projectRows.length
      } 个项目`
    );

    const projectMap = new Map(projectRows.map((p) => [p.projectId, p]));

    t1 = Date.now();
    const [userSettings] = await db
      .select()
      .from(settings)
      .where(eq(settings.userId, input.userId));
    console.log(`[export] [DB] 查询用户设置耗时: ${Date.now() - t1}ms`);

    const template = userSettings?.exportTemplateJson ?? {
      includeMerchantKeyword: false,
      includeExpenseId: false,
      includeReceiptIds: false,
      sortDirection: "asc",
      includeYaml: true,
    };

    console.log(
      `[export] 导出配置: includeYaml=${template.includeYaml}, sortDirection=${template.sortDirection}`
    );

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

    console.log(`[export] 开始查询费用数据...`);
    t1 = Date.now();

    const expenseRows = await db
      .select()
      .from(expenses)
      .where(and(...expenseFilters));

    console.log(
      `[export] [DB] 查询费用记录耗时: ${Date.now() - t1}ms - 找到 ${
        expenseRows.length
      } 条`
    );

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
      `[export] [DB] 查询票据记录耗时: ${Date.now() - t1}ms - 找到 ${
        receiptRows.length
      } 张`
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

    console.log(`[export] 开始构建CSV数据...`);
    t1 = Date.now();

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

    console.log(
      `[export] CSV数据构建完成, 耗时: ${Date.now() - t1}ms - 共 ${
        entries.length
      } 条记录`
    );

    t1 = Date.now();
    const csvBuffer = Buffer.from(withUtf8Bom(buildCsv(csvRows)), "utf-8");

    console.log(
      `[export] CSV文件生成完成, 耗时: ${Date.now() - t1}ms - 大小: ${(
        csvBuffer.length / 1024
      ).toFixed(2)}KB`
    );

    if (record.type === "csv") {
      console.log(`[export] 准备上传CSV文件...`);
      await finalizeExport(
        record.exportId,
        csvBuffer,
        "text/csv",
        "csv",
        input.userId
      );
      console.log(
        `[export] CSV导出完成, 总耗时: ${Date.now() - jobStartTime}ms`
      );
      return;
    }

    if (record.type === "pdf") {
      console.log(`[export] PDF类型已废弃，改用YAML索引...`);
      t1 = Date.now();
      const yamlBuffer = buildYamlIndex({
        batchName: batch?.name || "Items Export",
        projectLabel:
          projectRows.length === 1
            ? projectRows[0].name ?? "-"
            : "Multiple Projects",
        entries,
      });
      console.log(
        `[export] YAML索引生成完成, 耗时: ${Date.now() - t1}ms - 大小: ${(
          yamlBuffer.length / 1024
        ).toFixed(2)}KB`
      );
      await finalizeExport(
        record.exportId,
        yamlBuffer,
        "text/yaml",
        "yaml",
        input.userId
      );
      console.log(
        `[export] YAML导出完成, 总耗时: ${Date.now() - jobStartTime}ms`
      );
      return;
    }

    console.log(`[export] 开始生成ZIP文件...`);

    t1 = Date.now();
    const yamlBuffer = template.includeYaml
      ? buildYamlIndex({
          batchName: batch?.name || "Items Export",
          projectLabel:
            projectRows.length === 1
              ? projectRows[0].name ?? "-"
              : "Multiple Projects",
          entries,
        })
      : null;

    if (yamlBuffer) {
      console.log(
        `[export] YAML索引生成完成, 耗时: ${Date.now() - t1}ms - 大小: ${(
          yamlBuffer.length / 1024
        ).toFixed(2)}KB`
      );
    }

    t1 = Date.now();
    const zipBuffer = await buildZipArchive({ csvBuffer, entries, yamlBuffer });
    console.log(
      `[export] ZIP文件生成完成, 耗时: ${Date.now() - t1}ms - 大小: ${(
        zipBuffer.length / 1024
      ).toFixed(2)}KB`
    );

    await finalizeExport(
      record.exportId,
      zipBuffer,
      "application/zip",
      "zip",
      input.userId
    );
    console.log(
      `[export] ========== ZIP导出完成, 总耗时: ${
        Date.now() - jobStartTime
      }ms ==========`
    );
  } catch (error) {
    console.error(`[export] 导出失败:`, error);
    await db
      .update(exportRecords)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(exportRecords.exportId, input.exportId));
  }
}

function buildCsvHeader(template: Record<string, unknown>) {
  const header = [
    "序号",
    "项目",
    "日期",
    "金额",
    "类别",
    "事项备注",
    "状态",
    "票据数量",
    "票据文件名列表",
  ];

  if (template.includeMerchantKeyword) {
    header.push("商户关键字");
  }
  if (template.includeExpenseId) {
    header.push("支出ID");
  }
  if (template.includeReceiptIds) {
    header.push("票据ID列表");
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
    input.receiptNames.join("; "),
  ];

  if (input.template.includeMerchantKeyword) {
    row.push(merchantKeywords || null);
  }
  if (input.template.includeExpenseId) {
    row.push(input.expense.expenseId);
  }
  if (input.template.includeReceiptIds) {
    const receiptIds = input.receipts.map((r) => r.receiptId).join(";");
    row.push(receiptIds);
  }

  return row;
}

function mapStatusLabel(status: string | null) {
  switch (status) {
    case "approved":
      return "已批准";
    case "rejected":
      return "已驳回";
    case "pending":
      return "待审批";
    default:
      return status ?? "-";
  }
}

async function buildZipArchive(input: {
  csvBuffer: Buffer;
  entries: ExportEntry[];
  yamlBuffer: Buffer | null;
}): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const buffers: Buffer[] = [];

  stream.on("data", (data) => buffers.push(data as Buffer));

  const archivePromise = new Promise<Buffer>((resolve, reject) => {
    archive.on("error", reject);
    stream.on("finish", () => resolve(Buffer.concat(buffers)));
  });

  archive.pipe(stream);

  archive.append(input.csvBuffer, { name: "expenses.csv" });

  if (input.yamlBuffer) {
    archive.append(input.yamlBuffer, { name: "index.yaml" });
  }

  for (const entry of input.entries) {
    for (const receipt of entry.receipts) {
      const object = await downloadObject(receipt.storageKey);
      archive.append(object, { name: receipt.filename });
    }
  }

  await archive.finalize();
  return archivePromise;
}

async function finalizeExport(
  exportId: string,
  buffer: Buffer,
  contentType: string,
  extension: string,
  userId: string
) {
  const storageKey = `exports/${exportId}.${extension}`;
  const result = await uploadObject({ storageKey, body: buffer, contentType });

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
    `[export] 文件上传完成: ${storageKey} (${(result.size / 1024).toFixed(
      2
    )}KB)`
  );
}

function buildYamlIndex(input: {
  batchName: string;
  projectLabel: string;
  entries: ExportEntry[];
}) {
  const data = {
    batch: input.batchName,
    project: input.projectLabel,
    items: input.entries.map((entry) => ({
      sequence: entry.sequence,
      date: formatDate(entry.expense.date),
      amount: Number(entry.expense.amount),
      category: entry.expense.category,
      note: entry.expense.note,
      receipts: entry.receipts.map((r) => ({
        receiptId: r.receiptId,
        filename: r.filename,
      })),
    })),
  };

  return Buffer.from(yaml.dump(data), "utf-8");
}
