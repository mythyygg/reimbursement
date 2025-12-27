/**
 * 导出任务处理器 - Export Job
 *
 * 功能：将批次中的支出和票据导出为 ZIP 压缩包
 *
 * 导出内容包括：
 * 1. CSV 文件：支出清单（金额、日期、备注等）
 * 2. 票据图片/PDF：所有关联的票据文件
 * 3. YAML 索引（可选）：结构化索引，方便程序处理和人工阅读
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

// js-yaml: 用于生成 YAML 文档的库
import yaml from "js-yaml";

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
  console.log(`[export] 开始处理导出任务: ${input.exportId}`);

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
    console.log(`[export] 导出记录不存在: ${input.exportId}`);
    return;
  }

  console.log(`[export] 导出类型: ${record.type}, 批次ID: ${record.batchId || '无'}`);

  await db
    .update(exportRecords)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(exportRecords.exportId, input.exportId));

  console.log(`[export] 状态已更新为 running`);

  try {
    const projectIds = (record.projectIds ?? []) as string[];
    const isBatchExport = !!record.batchId;

    console.log(`[export] 项目IDs: ${projectIds.join(', ')}`);

    let batch: typeof batches.$inferSelect | undefined;
    if (isBatchExport && record.batchId) {
      [batch] = await db
        .select()
        .from(batches)
        .where(eq(batches.batchId, record.batchId));
      console.log(`[export] 批次信息: ${batch?.name}`);
    }

    const projectRows = await db
      .select()
      .from(projects)
      .where(inArray(projects.projectId, projectIds));

    console.log(`[export] 找到 ${projectRows.length} 个项目`);

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
      includeYaml: true,
    };

    console.log(`[export] 导出配置: includeYaml=${template.includeYaml}, sortDirection=${template.sortDirection}`);

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

    const expenseRows = await db
      .select()
      .from(expenses)
      .where(and(...expenseFilters));

    console.log(`[export] 找到 ${expenseRows.length} 条费用记录`);

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

    console.log(`[export] 找到 ${receiptRows.length} 张票据`);

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

    console.log(`[export] CSV数据构建完成，共 ${entries.length} 条记录`);

    const csvBuffer = Buffer.from(withUtf8Bom(buildCsv(csvRows)), "utf-8");

    console.log(`[export] CSV文件生成完成，大小: ${(csvBuffer.length / 1024).toFixed(2)}KB`);

    if (record.type === "csv") {
      console.log(`[export] 准备上传CSV文件...`);
      await finalizeExport(
        record.exportId,
        csvBuffer,
        "text/csv",
        "csv",
        input.userId
      );
      console.log(`[export] CSV导出完成`);
      return;
    }

    if (record.type === "pdf") {
      console.log(`[export] PDF类型已废弃，改用YAML索引...`);
      const yamlBuffer = buildYamlIndex({
        batchName: batch?.name || "Items Export",
        projectLabel: projectRows.length === 1 ? projectRows[0].name ?? "-" : "Multiple Projects",
        entries,
      });
      console.log(`[export] YAML索引生成完成，大小: ${(yamlBuffer.length / 1024).toFixed(2)}KB`);
      await finalizeExport(
        record.exportId,
        yamlBuffer,
        "text/yaml",
        "yaml",
        input.userId
      );
      console.log(`[export] YAML导出完成`);
      return;
    }

    console.log(`[export] 开始生成ZIP文件...`);

    const yamlBuffer = template.includeYaml
      ? buildYamlIndex({
        batchName: batch?.name || "Items Export",
        projectLabel: projectRows.length === 1 ? projectRows[0].name ?? "-" : "Multiple Projects",
        entries,
      })
      : null;

    if (yamlBuffer) {
      console.log(`[export] YAML索引生成完成，大小: ${(yamlBuffer.length / 1024).toFixed(2)}KB`);
    }

    const zipBuffer = await buildZipArchive({ csvBuffer, entries, yamlBuffer });
    console.log(`[export] ZIP文件生成完成，大小: ${(zipBuffer.length / 1024).toFixed(2)}KB`);

    await finalizeExport(
      record.exportId,
      zipBuffer,
      "application/zip",
      "zip",
      input.userId
    );
    console.log(`[export] ZIP导出完成`);
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
  yamlBuffer: Buffer | null;
}): Promise<Buffer> {
  console.log(`[export] 开始构建ZIP压缩包，包含 ${input.entries.length} 个费用条目`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  // 先注册所有事件监听器，再开始操作
  const resultPromise = new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

    stream.on("end", () => {
      console.log(`[export] ZIP压缩完成`);
      resolve(Buffer.concat(chunks));
    });

    stream.on("error", (err) => {
      console.error(`[export] Stream错误:`, err);
      reject(err);
    });

    archive.on("error", (err) => {
      console.error(`[export] archiver错误:`, err);
      reject(err);
    });
  });

  archive.pipe(stream);

  console.log(`[export] 添加CSV文件到ZIP`);
  archive.append(input.csvBuffer, { name: "batch.csv" });

  if (input.yamlBuffer) {
    console.log(`[export] 添加YAML索引到ZIP`);
    archive.append(input.yamlBuffer, { name: "index.yaml" });
  }

  let downloadedCount = 0;
  const totalReceipts = input.entries.reduce((sum, e) => sum + e.receipts.length, 0);

  for (const entry of input.entries) {
    for (const receipt of entry.receipts) {
      try {
        downloadedCount++;
        console.log(`[export] 下载票据 ${downloadedCount}/${totalReceipts}: ${receipt.storageKey}`);
        const file = await downloadObject(receipt.storageKey);
        archive.append(file, { name: `receipts/${receipt.filename}` });
      } catch (error) {
        console.error(`[export] 下载票据失败: ${receipt.storageKey}`, error);
        throw error;
      }
    }
  }

  console.log(`[export] 所有票据已添加，开始压缩...`);
  await archive.finalize();
  console.log(`[export] finalize()完成，等待压缩结束...`);

  return resultPromise;
}

function buildYamlIndex(input: {
  batchName: string;
  projectLabel: string;
  entries: ExportEntry[];
}): Buffer {
  const yamlData = {
    batch: {
      name: input.batchName,
      project: input.projectLabel,
      exported_at: new Date().toISOString().slice(0, 10),
      total_entries: input.entries.length,
    },
    entries: input.entries.map((entry) => ({
      sequence: String(entry.sequence).padStart(3, "0"),
      date: formatDate(entry.expense.date),
      amount: formatAmount(Number(entry.expense.amount)),
      category: entry.expense.category ?? "-",
      note: entry.expense.note,
      status: mapStatusLabel(entry.expense.status),
      receipts: entry.receipts.map((r) => ({
        filename: r.filename,
        receipt_id: r.receiptId,
      })),
    })),
  };

  const yamlString = yaml.dump(yamlData, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  return Buffer.from(yamlString, "utf-8");
}

async function finalizeExport(
  exportId: string,
  buffer: Buffer,
  contentType: string,
  extension: string,
  userId: string
) {
  const storageKey = `users/${userId}/exports/${exportId}.${extension}`;

  console.log(`[export] 上传文件到对象存储: ${storageKey}`);

  const upload = await uploadObject({ storageKey, body: buffer, contentType });

  console.log(`[export] 文件上传成功，大小: ${(upload.size / 1024).toFixed(2)}KB`);

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

  console.log(`[export] 导出记录状态已更新为 done`);
}
