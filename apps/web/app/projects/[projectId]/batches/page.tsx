"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api";
import BottomNav from "../../../../components/BottomNav";

type ExpenseRow = {
  expenseId: string;
  date: string;
  amount: number | string;
  category: string | null;
  note: string | null;
  status: "pending" | "processing" | "completed" | string | null;
  receiptCount?: number;
};

type ReceiptItem = {
  receiptId: string;
  matchedExpenseId: string | null;
  fileUrl?: string | null;
  fileExt?: string | null;
  receiptType?: string | null;
};

const statusMeta = {
  pending: { label: "新建", tone: "text-text-secondary", dot: "bg-text-tertiary", pill: "bg-surface-1 text-text-secondary" },
  processing: { label: "处理中", tone: "text-warning", dot: "bg-warning", pill: "bg-warning-light text-warning" },
  completed: { label: "已报销", tone: "text-success", dot: "bg-success", pill: "bg-success-light text-success" }
};

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export default function DetailsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [preview, setPreview] = useState<{ url: string; isPdf: boolean } | null>(null);

  const { data } = useQuery({
    queryKey: ["expenses", projectId, "details"],
    queryFn: () => apiFetch(`/projects/${projectId}/expenses`)
  });

  const { data: receiptData } = useQuery({
    queryKey: ["receipts", projectId, "details"],
    queryFn: () => apiFetch(`/projects/${projectId}/receipts?matched=true`)
  });

  const expenses = Array.isArray(data) ? (data as ExpenseRow[]) : [];
  const receipts = Array.isArray(receiptData) ? (receiptData as ReceiptItem[]) : [];

  const receiptsByExpense = useMemo(() => {
    const map = new Map<string, ReceiptItem[]>();
    for (const receipt of receipts) {
      if (!receipt.matchedExpenseId) {
        continue;
      }
      const list = map.get(receipt.matchedExpenseId) ?? [];
      list.push(receipt);
      map.set(receipt.matchedExpenseId, list);
    }
    return map;
  }, [receipts]);

  const summary = useMemo(() => {
    const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const totalReceipts = expenses.reduce((sum, expense) => sum + (expense.receiptCount ?? 0), 0);
    return { totalAmount, totalReceipts };
  }, [expenses]);

  return (
    <div className="pb-24 lg:pb-10 bg-gradient-to-b from-surface-0 via-surface-1/40 to-surface-1">
      <div className="rounded-3xl bg-white border border-border p-6 shadow-card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-text-primary">明细</div>
            <div className="text-xs text-text-secondary mt-1">
              费用明细用于 PC 端录入报销系统，包含票据预览与数量统计。
            </div>
          </div>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border bg-surface-0 p-8 text-center shadow-sm">
          <div className="text-sm text-text-secondary font-medium">暂无费用明细</div>
          <div className="text-xs text-text-tertiary mt-1">先在报销单中添加费用</div>
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-white shadow-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 bg-gradient-to-r from-surface-0 to-surface-1">
            <div className="text-sm font-semibold text-text-primary">共 {expenses.length} 条明细</div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
              <span>票据 {summary.totalReceipts} 张</span>
              <span>合计 ¥{summary.totalAmount.toFixed(2)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full text-xs">
              <thead className="bg-surface-1 text-text-secondary sticky top-0 z-10">
                <tr className="text-[11px] uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-semibold">序号</th>
                  <th className="px-6 py-3 text-left font-semibold">日期</th>
                  <th className="px-6 py-3 text-right font-semibold">金额</th>
                  <th className="px-6 py-3 text-left font-semibold">类别</th>
                  <th className="px-6 py-3 text-left font-semibold">备注</th>
                  <th className="px-6 py-3 text-left font-semibold">状态</th>
                  <th className="px-6 py-3 text-right font-semibold">票据数</th>
                  <th className="px-6 py-3 text-left font-semibold">票据</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.map((expense, index) => {
                  const meta =
                    statusMeta[expense.status as keyof typeof statusMeta] ??
                    ({ label: expense.status ?? "-", tone: "text-text-secondary", dot: "bg-text-tertiary", pill: "bg-surface-1 text-text-secondary" } as const);
                  const expenseReceipts = receiptsByExpense.get(expense.expenseId) ?? [];
                  const fallbackCategory = expenseReceipts.find((receipt) => receipt.receiptType)?.receiptType ?? "未分类";
                  return (
                    <tr key={expense.expenseId} className={index % 2 === 0 ? "bg-white" : "bg-surface-0/50"}>
                      <td className="px-6 py-4 text-text-tertiary font-medium">{index + 1}</td>
                      <td className="px-6 py-4 text-text-secondary whitespace-nowrap">{formatDate(expense.date)}</td>
                      <td className="px-6 py-4 text-right font-semibold text-text-primary whitespace-nowrap tabular-nums">
                        ¥{Number(expense.amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                          {expense.category ?? fallbackCategory}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-text-secondary max-w-[320px] whitespace-normal break-words" title={expense.note ?? ""}>
                        {expense.note ?? "-"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-text-secondary tabular-nums">
                        {expense.receiptCount ?? 0}
                      </td>
                      <td className="px-6 py-4">
                        {expenseReceipts.length === 0 ? (
                          <span className="text-text-tertiary">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {expenseReceipts.map((receipt) => {
                              const ext = receipt.fileExt?.toLowerCase() ?? "";
                              const isPdf = ext === "pdf";
                              const previewUrl = receipt.fileUrl ?? "";
                              if (!previewUrl) {
                                return (
                                  <div
                                    key={receipt.receiptId}
                                    className="h-12 w-12 rounded-xl border border-dashed border-border text-[10px] text-text-tertiary flex items-center justify-center"
                                  >
                                    缺文件
                                  </div>
                                );
                              }
                              if (isPdf) {
                                return (
                                  <button
                                    key={receipt.receiptId}
                                    type="button"
                                    onClick={() => setPreview({ url: previewUrl, isPdf: true })}
                                    className="h-12 w-12 rounded-xl border border-border bg-surface-1 text-[10px] font-bold text-danger flex flex-col items-center justify-center hover:bg-surface-2 transition"
                                    title="查看 PDF 票据"
                                  >
                                    PDF
                                  </button>
                                );
                              }
                              return (
                                <button
                                  key={receipt.receiptId}
                                  type="button"
                                  onClick={() => setPreview({ url: previewUrl, isPdf: false })}
                                  className="h-12 w-12 rounded-xl overflow-hidden border border-border bg-surface-0 hover:ring-2 hover:ring-primary/30 transition"
                                  title="查看票据大图"
                                >
                                  <img
                                    src={previewUrl}
                                    alt="票据预览"
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-5xl w-full" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute -top-10 right-0 text-white text-sm"
            >
              关闭
            </button>
            <div className="rounded-2xl bg-white p-3 shadow-2xl">
              {preview.isPdf ? (
                <iframe
                  src={`${preview.url}#toolbar=0`}
                  title="PDF 票据预览"
                  className="w-full h-[80vh] rounded-xl border border-border"
                />
              ) : (
                <img src={preview.url} alt="票据大图" className="w-full max-h-[80vh] object-contain" />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav />
    </div>
  );
}
