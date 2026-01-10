import sharp from "sharp";
import { formatAmount, formatDate } from "../utils/index.js";
import { downloadObject } from "./services/storage.js";

type ReceiptData = {
  receiptId: string;
  filename: string;
  storageKey: string;
  fileExt: string;
};

type ExpenseEntry = {
  sequence: number;
  date: Date;
  amount: number;
  category: string | null;
  note: string | null;
  status: string | null;
  receipts: ReceiptData[];
};

type HtmlExportInput = {
  batchName: string;
  projectName: string;
  createdAt: Date;
  entries: ExpenseEntry[];
};

type ProcessedReceipt = {
  receiptId: string;
  thumbnailBase64: string;
  originalBase64: string;
  mimeType: string;
  isPdf: boolean;
};

const THUMBNAIL_WIDTH = 150;
const MAX_IMAGE_WIDTH = 1200;

function mapStatusLabel(status: string | null): string {
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

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}

async function processReceipt(receipt: ReceiptData): Promise<ProcessedReceipt> {
  const buffer = await downloadObject(receipt.storageKey);
  const ext = receipt.fileExt.toLowerCase();
  const mimeType = getMimeType(ext);
  const isPdf = ext === "pdf";

  if (isPdf) {
    // For PDF, we create a simple placeholder thumbnail and embed the full PDF
    const pdfIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <text x="12" y="16" text-anchor="middle" font-size="6" fill="#ef4444" stroke="none" font-family="Arial">PDF</text>
    </svg>`;
    const thumbnailBase64 = `data:image/svg+xml;base64,${Buffer.from(pdfIconSvg).toString("base64")}`;
    const originalBase64 = `data:${mimeType};base64,${buffer.toString("base64")}`;

    return {
      receiptId: receipt.receiptId,
      thumbnailBase64,
      originalBase64,
      mimeType,
      isPdf: true,
    };
  }

  // For images, generate thumbnail and compress original
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Generate thumbnail
    const thumbnailBuffer = await sharp(buffer)
      .resize(THUMBNAIL_WIDTH, undefined, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Compress original if too large
    let originalBuffer = buffer;
    if (metadata.width && metadata.width > MAX_IMAGE_WIDTH) {
      originalBuffer = await sharp(buffer)
        .resize(MAX_IMAGE_WIDTH, undefined, { fit: "inside" })
        .jpeg({ quality: 85 })
        .toBuffer();
    }

    return {
      receiptId: receipt.receiptId,
      thumbnailBase64: `data:image/jpeg;base64,${thumbnailBuffer.toString("base64")}`,
      originalBase64: `data:image/jpeg;base64,${originalBuffer.toString("base64")}`,
      mimeType: "image/jpeg",
      isPdf: false,
    };
  } catch (error) {
    console.error(`[html-export] Failed to process image ${receipt.receiptId}:`, error);
    // Fallback: use original as both thumbnail and full
    const base64 = `data:${mimeType};base64,${buffer.toString("base64")}`;
    return {
      receiptId: receipt.receiptId,
      thumbnailBase64: base64,
      originalBase64: base64,
      mimeType,
      isPdf: false,
    };
  }
}

function escapeHtml(text: string | null): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function buildHtmlExport(input: HtmlExportInput): Promise<Buffer> {
  console.log(`[html-export] Building HTML export for ${input.entries.length} entries`);

  // Process all receipts
  const receiptMap = new Map<string, ProcessedReceipt>();
  let processedCount = 0;

  for (const entry of input.entries) {
    for (const receipt of entry.receipts) {
      if (!receiptMap.has(receipt.receiptId)) {
        try {
          const processed = await processReceipt(receipt);
          receiptMap.set(receipt.receiptId, processed);
          processedCount++;
          if (processedCount % 10 === 0) {
            console.log(`[html-export] Processed ${processedCount} receipts`);
          }
        } catch (error) {
          console.error(`[html-export] Failed to process receipt ${receipt.receiptId}:`, error);
        }
      }
    }
  }

  console.log(`[html-export] Total receipts processed: ${processedCount}`);

  // Calculate totals
  const totalAmount = input.entries.reduce((sum, e) => sum + e.amount, 0);

  // Build HTML
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>报销报告 - ${escapeHtml(input.batchName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f9fafb;
      padding: 20px;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      padding: 32px;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .header-info {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      font-size: 14px;
      opacity: 0.9;
    }
    .summary {
      display: flex;
      gap: 32px;
      padding: 24px 32px;
      background: #f8fafc;
      border-bottom: 1px solid #e5e7eb;
    }
    .summary-item {
      text-align: center;
    }
    .summary-value {
      font-size: 28px;
      font-weight: 700;
      color: #3b82f6;
    }
    .summary-label {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .content { padding: 24px 32px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      background: #f8fafc;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }
    td {
      padding: 16px 12px;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
    }
    tr:hover { background: #f9fafb; }
    .seq {
      font-weight: 600;
      color: #6b7280;
      font-size: 12px;
    }
    .amount {
      font-weight: 600;
      color: #059669;
      white-space: nowrap;
    }
    .category {
      display: inline-block;
      padding: 2px 8px;
      background: #e0f2fe;
      color: #0369a1;
      border-radius: 4px;
      font-size: 12px;
    }
    .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .status-approved { background: #dcfce7; color: #166534; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .receipts {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .receipt-thumb {
      width: 60px;
      height: 60px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .receipt-thumb:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .modal.active { display: flex; }
    .modal-content {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      border-radius: 8px;
    }
    .modal-pdf {
      width: 90%;
      height: 90%;
      background: white;
      border-radius: 8px;
    }
    .modal-close {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      background: white;
      border: none;
      border-radius: 50%;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1001;
    }
    .footer {
      padding: 24px 32px;
      background: #f8fafc;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; border-radius: 0; }
      .receipt-thumb { break-inside: avoid; }
      .modal { display: none !important; }
      @page { margin: 1cm; }
    }
    @media (max-width: 768px) {
      body { padding: 10px; }
      .header, .content, .summary, .footer { padding: 16px; }
      .summary { flex-direction: column; gap: 16px; }
      table { font-size: 12px; }
      th, td { padding: 8px 6px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(input.batchName)}</h1>
      <div class="header-info">
        <span>项目：${escapeHtml(input.projectName)}</span>
        <span>创建时间：${formatDate(input.createdAt)}</span>
        <span>导出时间：${formatDate(new Date())}</span>
      </div>
    </div>

    <div class="summary">
      <div class="summary-item">
        <div class="summary-value">${input.entries.length}</div>
        <div class="summary-label">费用条目</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${formatAmount(totalAmount)}</div>
        <div class="summary-label">总金额</div>
      </div>
      <div class="summary-item">
        <div class="summary-value">${receiptMap.size}</div>
        <div class="summary-label">票据数量</div>
      </div>
    </div>

    <div class="content">
      <table>
        <thead>
          <tr>
            <th style="width:50px">序号</th>
            <th style="width:100px">日期</th>
            <th style="width:100px">金额</th>
            <th style="width:80px">类别</th>
            <th>事项备注</th>
            <th style="width:70px">状态</th>
            <th style="width:200px">票据</th>
          </tr>
        </thead>
        <tbody>
          ${input.entries
            .map((entry) => {
              const statusClass =
                entry.status === "approved"
                  ? "status-approved"
                  : entry.status === "rejected"
                  ? "status-rejected"
                  : "status-pending";
              const receiptsHtml = entry.receipts
                .map((r) => {
                  const processed = receiptMap.get(r.receiptId);
                  if (!processed) return "";
                  return `<img class="receipt-thumb" src="${processed.thumbnailBase64}" data-full="${processed.originalBase64}" data-pdf="${processed.isPdf}" alt="票据" onclick="openModal(this)">`;
                })
                .join("");

              return `<tr>
              <td class="seq">${String(entry.sequence).padStart(3, "0")}</td>
              <td>${formatDate(entry.date)}</td>
              <td class="amount">${formatAmount(entry.amount)}</td>
              <td><span class="category">${escapeHtml(entry.category) || "-"}</span></td>
              <td>${escapeHtml(entry.note) || "-"}</td>
              <td><span class="status ${statusClass}">${mapStatusLabel(entry.status)}</span></td>
              <td><div class="receipts">${receiptsHtml || '<span style="color:#9ca3af;font-size:12px">无票据</span>'}</div></td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="footer">
      报销报告由系统自动生成 · 打印请使用浏览器打印功能 (Ctrl/Cmd + P)
    </div>
  </div>

  <div class="modal" id="modal" onclick="closeModal(event)">
    <button class="modal-close" onclick="closeModal(event)">&times;</button>
    <img class="modal-content" id="modal-img" style="display:none">
    <iframe class="modal-pdf" id="modal-pdf" style="display:none"></iframe>
  </div>

  <script>
    function openModal(el) {
      const modal = document.getElementById('modal');
      const img = document.getElementById('modal-img');
      const pdf = document.getElementById('modal-pdf');
      const isPdf = el.dataset.pdf === 'true';

      if (isPdf) {
        img.style.display = 'none';
        pdf.style.display = 'block';
        pdf.src = el.dataset.full;
      } else {
        pdf.style.display = 'none';
        img.style.display = 'block';
        img.src = el.dataset.full;
      }
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeModal(e) {
      if (e.target.classList.contains('modal') || e.target.classList.contains('modal-close')) {
        document.getElementById('modal').classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        document.getElementById('modal').classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  </script>
</body>
</html>`;

  return Buffer.from(html, "utf-8");
}
