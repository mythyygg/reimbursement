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
    <div className="pb-24 bg-gradient-to-b from-white via-surface-1/60 to-surface-1">
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-white p-3 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-text-primary">报销单</div>
            <div className="text-[11px] text-text-secondary">共 {expenses.length} 条记录</div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[11px] text-text-secondary border border-border">
            <span className="h-2 w-2 rounded-full bg-primary" />
            底部可快速新增
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-white p-2 shadow-sm">
          {statusOptions.map((option) => (
            <button
              key={option}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition shadow-[0_8px_24px_-20px_rgba(0,0,0,0.45)] ${
                status === option
                  ? "bg-primary text-white"
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
          <div className="rounded-2xl bg-surface-0 p-6 text-sm text-text-secondary">
            暂无报销记录。
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
              className="rounded-2xl"
            >
              <div
                className="w-full rounded-2xl border border-border/80 bg-white p-4 shadow-[0_12px_36px_-30px_rgba(0,0,0,0.5)] animate-fade-up cursor-pointer"
                style={{ animationDelay: `${index * 40}ms` }}
                onClick={() => setSelectedExpense(expense)}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-secondary">{weekday}</span>
                  <span className="font-semibold text-text-primary truncate flex-shrink min-w-0">{expense.note}</span>
                  <span className="text-text-secondary whitespace-nowrap">{dateStr}</span>
                  {expense.category ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-border flex-shrink-0" />
                      <span className="text-text-secondary whitespace-nowrap">{expense.category}</span>
                    </>
                  ) : null}
                  {receiptCount > 0 ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-border flex-shrink-0" />
                      <span className="text-text-secondary whitespace-nowrap">{receiptCount}张票据</span>
                    </>
                  ) : null}
                  <span className="h-1 w-1 rounded-full bg-border flex-shrink-0" />
                  <span className={`${meta.tone} whitespace-nowrap`}>{meta.label}</span>
                  <span className="ml-auto font-semibold text-text-primary whitespace-nowrap">
                    ¥{Number(expense.amount).toFixed(2)}
                  </span>
                </div>
              </div>
            </SwipeAction>
          );
        })}
      </div>

      <div className="fixed bottom-16 left-0 right-0">
        <div className="mx-auto max-w-md px-4 pb-4">
          <div className="flex flex-col gap-2">
            {(errors.amount || errors.note) ? (
              <div className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                {errors.amount || errors.note}
              </div>
            ) : null}
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/95 p-2 shadow-2xl backdrop-blur">
              <div className="relative w-28">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-primary">¥</span>
                <input
                  className={`h-11 w-full rounded-xl border pl-7 pr-2 text-right text-sm font-semibold focus:border-primary/40 ${
                    errors.amount ? "border-danger bg-danger/5" : "border-transparent bg-surface-1"
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
                className={`h-11 flex-1 rounded-xl border px-3 text-sm focus:border-primary/40 ${
                  errors.note ? "border-danger bg-danger/5" : "border-transparent bg-surface-1"
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
                className="h-11 rounded-xl bg-primary px-4 text-sm text-white shadow-sm transition hover:shadow-md disabled:bg-primary/40 disabled:cursor-not-allowed"
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
      className="fixed inset-0 z-50 flex items-end bg-black/40 animate-fade-in"
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevent scrolling of background when touching the overlay
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full rounded-t-3xl bg-surface-0 p-5 shadow-2xl animate-fade-up max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold">报销单</div>
          <button className="text-sm text-text-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary w-16 flex-shrink-0">金额</label>
            <input
              className={`h-11 flex-1 rounded-xl border px-3 text-sm focus:border-primary/40 ${
                amountError ? "border-danger" : "border-border bg-surface-1"
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
          </div>
          {amountError ? (
            <p className="text-xs text-danger pl-[76px]">{amountError}</p>
          ) : null}

          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary w-16 flex-shrink-0">描述</label>
            <input
              className="h-11 flex-1 rounded-xl border border-border bg-surface-1 px-3 text-sm focus:border-primary/40"
              placeholder="报销事项"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-label="描述"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-text-secondary w-16 flex-shrink-0">状态</label>
            <select
              className="h-11 flex-1 rounded-xl border border-border bg-surface-1 px-3 text-sm focus:border-primary/40"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="状态"
            >
              <option value="pending">新建</option>
              <option value="processing">处理中</option>
              <option value="completed">已报销</option>
            </select>
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold mb-2">已关联票据</div>
            {(receipts as any[] | undefined)?.length ? (
              <div className="space-y-2">
                {(receipts as any[]).map((receipt) => (
                  <div key={receipt.receiptId} className="flex items-center justify-between rounded-xl bg-surface-1 px-3 py-2 text-xs border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{receipt.merchantKeyword || receipt.receiptId.slice(0, 8)}</div>
                      {receipt.receiptAmount ? (
                        <div className="text-text-secondary">¥{Number(receipt.receiptAmount).toFixed(2)}</div>
                      ) : null}
                    </div>
                    <button className="text-danger ml-2" onClick={() => unmatchReceipt(receipt.receiptId)}>
                      取消关联
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-secondary">暂无关联票据。</div>
            )}
          </div>

          <button
            className="h-11 w-full rounded-xl bg-primary text-sm text-white shadow-sm transition hover:shadow-md disabled:bg-primary/40 disabled:cursor-not-allowed mt-6"
            onClick={save}
            disabled={loading}
          >
            {loading ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
