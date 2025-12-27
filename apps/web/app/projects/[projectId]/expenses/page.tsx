"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api";
import { enqueueExpense } from "../../../../lib/offlineQueue";
import { generateClientRequestId } from "../../../../lib/uuid";
import BottomNav from "../../../../components/BottomNav";
import SwipeAction from "../../../../components/SwipeAction";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { useToast } from "../../../../components/Toast";
import { useErrorHandler } from "../../../../lib/useErrorHandler";

const statusOptions = ["all", "pending", "processing", "completed"];

const statusMeta = {
  pending: { label: "新建", tone: "text-text-secondary", dot: "bg-text-tertiary" },
  processing: { label: "处理中", tone: "text-warning", dot: "bg-warning" },
  completed: { label: "已报销", tone: "text-success", dot: "bg-success" }
};

function getDateParts(value: string) {
  const date = new Date(value);
  const day = date.getDate();
  // 使用中文星期缩写
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = weekdays[date.getDay()];
  return { day, weekday };
}

export default function ExpensesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [status, setStatus] = useState("all");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; note?: string }>({});

  const { showSuccess } = useToast();
  const { handleError } = useErrorHandler();

  const queryString = useMemo(() => {
    const parts: string[] = [];
    if (status !== "all") {
      parts.push(`status=${status}`);
    }
    return parts.length ? `?${parts.join("&")}` : "";
  }, [status]);

  const { data, refetch } = useQuery({
    queryKey: ["expenses", projectId, status],
    queryFn: () => apiFetch(`/projects/${projectId}/expenses${queryString}`)
  });

  const expenses = Array.isArray(data) ? data : [];

  const validateForm = () => {
    const newErrors: { amount?: string; note?: string } = {};

    if (!amount.trim()) {
      newErrors.amount = "请输入金额";
    } else if (isNaN(Number(amount)) || Number(amount) <= 0) {
      newErrors.amount = "请输入有效的金额";
    }

    if (!note.trim()) {
      newErrors.note = "请输入描述";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addExpense = async () => {
    if (!validateForm()) {
      return;
    }

    setAdding(true);
    try {
      const payload = {
        amount: Number(amount),
        note: note.trim(),
        client_request_id: generateClientRequestId()
      };
      if (navigator.onLine) {
        await apiFetch(`/projects/${projectId}/expenses`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      } else {
        await enqueueExpense({ projectId, body: payload });
      }
      setAmount("");
      setNote("");
      setErrors({});
      await refetch();
      showSuccess("报销单已添加");
    } catch (error) {
      handleError(error, "添加报销单失败");
    } finally {
      setAdding(false);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    try {
      await apiFetch(`/expenses/${expenseId}`, { method: "DELETE" });
      if (selectedExpense?.expenseId === expenseId) {
        setSelectedExpense(null);
      }
      await refetch();
      showSuccess("报销单已删除");
    } catch (error) {
      handleError(error, "删除报销单失败");
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="pb-24 bg-gradient-to-b from-surface-0 via-surface-1/40 to-surface-1">
      <div className="mb-5 space-y-4">
        <div className="flex items-center justify-between rounded-3xl border border-border bg-white p-5 shadow-card">
          <div>
            <div className="text-base font-bold text-text-primary">报销单</div>
            <div className="text-xs text-text-secondary mt-1">共 {expenses.length} 条记录</div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary-light/50 px-4 py-2 text-xs font-semibold text-primary border border-primary/20">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            底部快速新增
          </div>
        </div>
        <div className="flex gap-2.5 overflow-x-auto rounded-3xl border border-border bg-white p-3 shadow-card scrollbar-hide">
          {statusOptions.map((option) => (
            <button
              key={option}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-all whitespace-nowrap ${
                status === option
                  ? "bg-primary text-white shadow-md shadow-primary/30 scale-105"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-1"
              }`}
              onClick={() => setStatus(option)}
            >
              {{
                all: "全部",
                pending: "新建",
                processing: "处理中",
                completed: "已报销"
              }[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {expenses.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border bg-surface-0 p-8 text-center shadow-sm">
            <div className="text-sm text-text-secondary font-medium">暂无报销记录</div>
            <div className="text-xs text-text-tertiary mt-1">在底部快速录入栏添加报销单</div>
          </div>
        ) : null}
        {expenses.map((expense: any, index: number) => {
          const meta =
            statusMeta[expense.status as keyof typeof statusMeta] ??
            ({ label: expense.status, tone: "text-text-secondary", dot: "bg-text-tertiary" } as const);
          const { day, weekday } = getDateParts(expense.date);
          const receiptCount = expense.receiptCount ?? 0;
          const dateStr = new Date(expense.date).toISOString().slice(0, 10);
          return (
            <SwipeAction
              key={expense.expenseId}
              onDelete={() => setDeleteConfirm(expense.expenseId)}
              className="rounded-3xl"
            >
              <div
                className="w-full rounded-3xl border border-border bg-white p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all animate-fade-up cursor-pointer"
                style={{ animationDelay: `${index * 30}ms` }}
                onClick={() => setSelectedExpense(expense)}
              >
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center justify-center min-w-[44px] h-[44px] rounded-2xl bg-surface-2 text-text-secondary">
                    <span className="text-xs font-bold">{weekday}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-bold text-text-primary truncate">{expense.note}</span>
                      <span className="font-bold text-lg text-primary whitespace-nowrap">
                        ¥{Number(expense.amount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="text-text-secondary">{dateStr}</span>
                      <span className="h-1 w-1 rounded-full bg-border-strong" />
                      <span className={`flex items-center gap-1 ${meta.tone} font-medium`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      {receiptCount > 0 ? (
                        <>
                          <span className="h-1 w-1 rounded-full bg-border-strong" />
                          <span className="text-text-secondary flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            {receiptCount}
                          </span>
                        </>
                      ) : null}
                      {expense.category ? (
                        <>
                          <span className="h-1 w-1 rounded-full bg-border-strong" />
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text-secondary">{expense.category}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </SwipeAction>
          );
        })}
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-10">
        <div className="mx-auto max-w-md px-4 pb-4">
          <div className="flex flex-col gap-2.5">
            {(errors.amount || errors.note) ? (
              <div className="rounded-2xl bg-danger-light border border-danger/20 px-4 py-3 text-sm text-danger font-medium animate-slide-down">
                {errors.amount || errors.note}
              </div>
            ) : null}
            <div className="flex items-center gap-2.5 rounded-3xl border-2 border-border bg-white/98 p-3 shadow-xl backdrop-blur-sm">
              <div className="relative min-w-[100px]">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-primary">¥</span>
                <input
                  className={`h-12 w-full rounded-2xl border-2 pl-8 pr-3 text-right text-sm font-bold transition-all focus:ring-4 focus:ring-primary/10 focus:outline-none ${
                    errors.amount ? "border-danger bg-danger-light" : "border-transparent bg-surface-1 focus:border-primary"
                  }`}
                  placeholder="0.00"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (errors.amount) setErrors({ ...errors, amount: undefined });
                  }}
                  aria-label="金额"
                  aria-invalid={!!errors.amount}
                />
              </div>
              <input
                className={`h-12 flex-1 rounded-2xl border-2 px-4 text-sm transition-all focus:ring-4 focus:ring-primary/10 focus:outline-none ${
                  errors.note ? "border-danger bg-danger-light" : "border-transparent bg-surface-1 focus:border-primary"
                }`}
                placeholder="描述报销事项..."
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  if (errors.note) setErrors({ ...errors, note: undefined });
                }}
                aria-label="描述"
                aria-invalid={!!errors.note}
              />
              <button
                className="h-12 rounded-2xl bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:bg-primary/40 disabled:cursor-not-allowed disabled:shadow-none transition-all"
                onClick={addExpense}
                disabled={adding}
              >
                {adding ? "..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedExpense ? (
        <ExpenseDrawer
          expense={selectedExpense}
          onClose={() => setSelectedExpense(null)}
          onUpdated={async () => {
            await refetch();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="确认删除"
        message="删除后不可恢复，确定删除这条报销单吗？"
        danger
        onConfirm={() => deleteConfirm && deleteExpense(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <BottomNav />
    </div>
  );
}

function ExpenseDrawer({
  expense,
  onClose,
  onUpdated
}: {
  expense: any;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(expense.amount));
  const [note, setNote] = useState(expense.note);
  const [status, setStatus] = useState(expense.status);
  const [loading, setLoading] = useState(false);
  const [amountError, setAmountError] = useState("");

  const { showSuccess } = useToast();
  const { handleError } = useErrorHandler();

  const { data: receipts, refetch } = useQuery({
    queryKey: ["expense-receipts", expense.expenseId],
    queryFn: () => apiFetch(`/expenses/${expense.expenseId}/receipts`)
  });

  // Prevent body scroll when drawer is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const save = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAmountError("请输入有效的金额");
      return;
    }

    setLoading(true);
    try {
      await apiFetch(`/expenses/${expense.expenseId}`, {
        method: "PATCH",
        body: JSON.stringify({ amount: Number(amount), note, status })
      });
      await onUpdated();
      showSuccess("报销单已更新");
      onClose();
    } catch (error) {
      handleError(error, "更新报销单失败");
    } finally {
      setLoading(false);
    }
  };

  const unmatchReceipt = async (receiptId: string) => {
    try {
      await apiFetch(`/receipts/${receiptId}/match`, {
        method: "PATCH",
        body: JSON.stringify({ expense_id: null })
      });
      await refetch();
      await onUpdated();
      showSuccess("已取消关联");
    } catch (error) {
      handleError(error, "取消关联失败");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevent scrolling of background when touching the overlay
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full rounded-t-4xl bg-surface-0 p-6 shadow-2xl animate-slide-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="text-xl font-bold text-text-primary">报销单详情</div>
          <button
            className="rounded-full p-2 hover:bg-surface-2 transition-colors"
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-primary">金额</label>
            <input
              className={`h-12 w-full rounded-2xl border-2 px-4 text-sm transition-all focus:ring-4 focus:ring-primary/10 focus:outline-none ${
                amountError ? "border-danger bg-danger-light" : "border-border bg-surface-1 focus:border-primary"
              }`}
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (amountError) setAmountError("");
              }}
              aria-label="金额"
              aria-invalid={!!amountError}
            />
            {amountError ? (
              <p className="text-xs text-danger font-medium">{amountError}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-primary">描述</label>
            <input
              className="h-12 w-full rounded-2xl border-2 border-border bg-surface-1 px-4 text-sm transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none"
              placeholder="报销事项"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-label="描述"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-primary">状态</label>
            <select
              className="h-12 w-full rounded-2xl border-2 border-border bg-surface-1 px-4 text-sm font-medium transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="状态"
            >
              <option value="pending">新建</option>
              <option value="processing">处理中</option>
              <option value="completed">已报销</option>
            </select>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <div className="text-base font-bold mb-3 text-text-primary">已关联票据</div>
            {(receipts as any[] | undefined)?.length ? (
              <div className="space-y-2.5">
                {(receipts as any[]).map((receipt) => (
                  <div key={receipt.receiptId} className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold text-sm text-text-primary">{receipt.merchantKeyword || receipt.receiptId.slice(0, 8)}</div>
                      {receipt.receiptAmount ? (
                        <div className="text-xs text-text-secondary mt-0.5">¥{Number(receipt.receiptAmount).toFixed(2)}</div>
                      ) : null}
                    </div>
                    <button
                      className="text-xs font-semibold text-danger hover:text-danger/80 ml-3 transition-colors"
                      onClick={() => unmatchReceipt(receipt.receiptId)}
                    >
                      取消关联
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-secondary text-center py-4">暂无关联票据</div>
            )}
          </div>

          <button
            className="h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:bg-primary/40 disabled:cursor-not-allowed disabled:shadow-none transition-all mt-6"
            onClick={save}
            disabled={loading}
          >
            {loading ? "保存中..." : "保存更改"}
          </button>
        </div>
      </div>
    </div>
  );
}
