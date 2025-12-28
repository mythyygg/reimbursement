"use client";

import { useEffect, useRef, useState } from "react";
import SwipeAction from "../../../../components/SwipeAction";
import { apiFetch } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import { useErrorHandler } from "../../../../lib/useErrorHandler";
import type { CandidateRecord, ReceiptRecord } from "./types";

function formatDateInput(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatCandidateLabel(candidate: CandidateRecord) {
  const labelParts: string[] = [];
  if (candidate.note) labelParts.push(candidate.note);
  if (candidate.amount) labelParts.push(`¥${Number(candidate.amount).toFixed(2)}`);
  if (candidate.date) {
    try {
      labelParts.push(new Date(candidate.date).toISOString().slice(0, 10));
    } catch {
      // ignore parse errors
    }
  }
  if (labelParts.length === 0) {
    labelParts.push(candidate.expenseId.slice(0, 6));
  }
  const mainLabel = labelParts[0];
  const subLabel = labelParts.slice(1).join(" · ");
  return { mainLabel, subLabel };
}

type ReceiptCardProps = {
  receipt: ReceiptRecord;
  index: number;
  onUpdated: () => Promise<void>;
  onPreview: (receipt: ReceiptRecord) => Promise<void>;
  onDelete: (receiptId: string) => Promise<void>;
  expanded: boolean;
  onToggle: () => void;
  candidates: CandidateRecord[]; // 从父组件传入，不再自己查询
};

export function ReceiptCard({
  receipt,
  index,
  onUpdated,
  onPreview,
  onDelete,
  expanded,
  onToggle,
  candidates: candidatesProp
}: ReceiptCardProps) {
  const [amountInput, setAmountInput] = useState(receipt.receiptAmount || "");
  const [dateInput, setDateInput] = useState(
    formatDateInput(receipt.receiptDate || receipt.updatedAt || receipt.createdAt)
  );
  const [merchantKeyword, setMerchantKeyword] = useState(receipt.merchantKeyword || "");
  const [manualExpenseId, setManualExpenseId] = useState("");
  const [manualSelectOpen, setManualSelectOpen] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [amountError, setAmountError] = useState("");
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { showSuccess } = useToast();
  const { handleError } = useErrorHandler();

  useEffect(() => {
    setThumbError(false);
  }, [receipt.fileUrl]);

  useEffect(() => {
    setAmountInput(receipt.receiptAmount || "");
    setDateInput(
      formatDateInput(receipt.receiptDate || receipt.updatedAt || receipt.createdAt)
    );
    setMerchantKeyword(receipt.merchantKeyword || "");
  }, [receipt.receiptAmount, receipt.receiptDate, receipt.updatedAt, receipt.createdAt, receipt.merchantKeyword, receipt.receiptId]);

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setManualSelectOpen(false);
      }
    };
    document.addEventListener("click", handleClickAway);
    return () => document.removeEventListener("click", handleClickAway);
  }, []);

  // 使用从父组件传入的candidates，而不是自己查询
  const candidateList = candidatesProp ?? [];

  const saveReceiptFields = async () => {
    // Validate amount
    if (amountInput && (isNaN(Number(amountInput)) || Number(amountInput) <= 0)) {
      setAmountError("请输入有效的金额");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/receipts/${receipt.receiptId}`, {
        method: "PATCH",
        body: JSON.stringify({
          receipt_amount: amountInput ? Number(amountInput) : undefined,
          receipt_date: dateInput ? new Date(dateInput).toISOString() : undefined,
          merchant_keyword: merchantKeyword || undefined
        })
      });
      await onUpdated();
      showSuccess("票据已保存");
      if (expanded) {
        onToggle();
      }
    } catch (error) {
      handleError(error, "保存票据失败");
    } finally {
      setSaving(false);
    }
  };

  const matchExpense = async (expenseId: string) => {
    setMatching(true);
    try {
      await apiFetch(`/receipts/${receipt.receiptId}/match`, {
        method: "PATCH",
        body: JSON.stringify({ expense_id: expenseId })
      });
      setManualExpenseId("");
      setManualSelectOpen(false);
      await onUpdated();
      showSuccess("票据已关联");
    } catch (error) {
      handleError(error, "关联失败");
    } finally {
      setMatching(false);
    }
  };

  const unmatch = async () => {
    setMatching(true);
    try {
      await apiFetch(`/receipts/${receipt.receiptId}/match`, {
        method: "PATCH",
        body: JSON.stringify({ expense_id: null })
      });
      setManualExpenseId("");
      setManualSelectOpen(false);
      await onUpdated();
      showSuccess("已取消关联");
    } catch (error) {
      handleError(error, "取消关联失败");
    } finally {
      setMatching(false);
    }
  };

  const manualOptions = candidateList.map((candidate) => {
    const { mainLabel, subLabel } = formatCandidateLabel(candidate);
    return {
      value: candidate.expenseId,
      mainLabel,
      subLabel,
      status: candidate.status ?? undefined
    };
  });
  const selectedManual =
    manualOptions.find((item) => item.value === manualExpenseId) ||
    (receipt.matchedExpenseId
      ? manualOptions.find((item) => item.value === receipt.matchedExpenseId)
      : undefined);

  const isPdf = receipt.fileExt?.toLowerCase() === "pdf";
  const summaryDate =
    receipt.receiptDate ||
    receipt.updatedAt ||
    receipt.createdAt ||
    "";

  return (
    <SwipeAction
      onDelete={() => onDelete(receipt.receiptId)}
      className="rounded-2xl"
    >
      <div
        className="overflow-hidden rounded-2xl border border-border/80 bg-white shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] animate-fade-up"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div
          role="button"
          tabIndex={0}
          className="flex w-full items-start gap-3 px-4 py-3 text-left"
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle();
            }
          }}
        >
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-surface-1">
            {receipt.fileUrl && !isPdf && !thumbError ? (
              <img
                src={receipt.fileUrl}
                alt="票据预览"
                className="h-full w-full object-cover"
                loading="lazy"
                onError={() => setThumbError(true)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-[10px] text-text-secondary">
                <DocumentIcon className="h-5 w-5 text-border" />
                <span>{isPdf ? "PDF" : "预览"}</span>
              </div>
            )}
            <div className="absolute bottom-1 right-1">
              <div
                role="button"
                tabIndex={0}
                className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white shadow"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(receipt);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onPreview(receipt);
                  }
                }}
              >
                <EyeIcon />
                预览
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <div className="truncate text-sm font-semibold text-text-primary">{merchantKeyword || `票据 ${receipt.receiptId.slice(0, 6)}`}</div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${receipt.matchedExpenseId ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
                  {receipt.matchedExpenseId ? "已关联" : "待关联"}
                </span>
                {receipt.duplicateFlag ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">疑似重复</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span>{summaryDate ? summaryDate.toString().slice(0, 10) : "日期待识别"}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{receipt.merchantKeyword || receipt.receiptDate || receipt.receiptAmount ? "信息已补全" : "信息待补充"}</span>
            </div>
          </div>
          <div className="text-[11px] text-text-secondary">{expanded ? "收起" : "展开"}</div>
        </div>

        {expanded ? (
          <div className="grid gap-4 border-t border-border bg-gradient-to-b from-white to-surface-1 p-4">
            <div className="grid gap-3 rounded-xl bg-surface-1 p-3 border border-border/80 shadow-inner">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-text-secondary w-12 flex-shrink-0">票据名</label>
                <input
                  className="h-11 flex-1 rounded-xl border border-border bg-surface-0 px-3 text-xs focus:border-primary/40"
                  placeholder="票据名"
                  value={merchantKeyword}
                  onChange={(event) => setMerchantKeyword(event.target.value)}
                  aria-label="票据名"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-text-secondary w-12 flex-shrink-0">日期</label>
                <input
                  type="date"
                  className="h-11 flex-1 rounded-xl border border-border bg-surface-0 px-3 text-xs focus:border-primary/40"
                  value={dateInput}
                  onChange={(event) => setDateInput(event.target.value)}
                  aria-label="日期"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-text-secondary w-12 flex-shrink-0">金额</label>
                <input
                  className={`h-11 flex-1 rounded-xl border px-3 text-xs focus:border-primary/40 ${amountError ? "border-danger bg-danger/5" : "border-border bg-surface-0"
                    }`}
                  placeholder="0.00"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => {
                    setAmountInput(event.target.value);
                    if (amountError) setAmountError("");
                  }}
                  aria-label="金额"
                  aria-invalid={!!amountError}
                />
              </div>
              {amountError ? (
                <p className="text-xs text-danger pl-[60px]">{amountError}</p>
              ) : null}
            </div>

            <div className="rounded-xl bg-surface-1 p-3">
              <div className="text-[10px] font-medium text-text-secondary">推荐</div>
              {candidateList.length ? (
                <div className="mt-2 space-y-2">
                  {candidateList.map((candidate) => {
                    const { mainLabel, subLabel } = formatCandidateLabel(candidate);
                    return (
                      <div
                        key={candidate.expenseId}
                        className="flex items-start justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs border border-border/80 shadow-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate">{mainLabel}</div>
                          {subLabel ? <div className="truncate text-text-tertiary">{subLabel}</div> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {candidate.confidence ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              {candidate.confidence}
                            </span>
                          ) : null}
                          <button
                            className="text-primary disabled:text-primary/40 disabled:cursor-not-allowed"
                            onClick={() => matchExpense(candidate.expenseId)}
                            disabled={matching}
                          >
                            {matching ? "关联中..." : "关联"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-xs text-text-secondary">暂无推荐。</div>
              )}
            </div>

            <div className="rounded-xl bg-surface-1 p-3">
              <div className="text-[10px] font-medium text-text-secondary">手动关联</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1" ref={dropdownRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-0 px-3 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    onClick={() => setManualSelectOpen((prev) => !prev)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-text-primary">
                        {selectedManual?.mainLabel ?? "选择报销单"}
                      </div>
                      <div className="truncate text-[10px] text-text-secondary">
                        {selectedManual?.subLabel ?? "按需关联票据到报销单"}
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-3 w-3 text-text-tertiary transition-transform ${manualSelectOpen ? "-rotate-180" : ""}`}
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </svg>
                  </button>
                  {manualSelectOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-surface-0 shadow-lg">
                      <div className="max-h-60 overflow-auto py-1">
                        {manualOptions.length ? (
                          manualOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-surface-1"
                              onClick={() => {
                                setManualExpenseId(option.value);
                                setManualSelectOpen(false);
                              }}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-text-primary">{option.mainLabel}</div>
                                {option.subLabel ? (
                                  <div className="truncate text-[10px] text-text-secondary">{option.subLabel}</div>
                                ) : null}
                              </div>
                              {manualExpenseId === option.value ? (
                                <span className="text-[10px] text-primary">已选</span>
                              ) : null}
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-[10px] text-text-secondary">暂无可选报销单</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {receipt.matchedExpenseId ? (
                    <button
                      className="h-11 rounded-xl bg-danger px-4 text-xs text-white whitespace-nowrap disabled:bg-danger/40 disabled:cursor-not-allowed"
                      onClick={unmatch}
                      disabled={matching}
                    >
                      {matching ? "处理中..." : "取消关联"}
                    </button>
                  ) : (
                    <button
                      className="h-11 rounded-xl bg-primary px-4 text-xs text-white shadow-sm transition hover:shadow disabled:cursor-not-allowed disabled:bg-primary/40 whitespace-nowrap"
                      disabled={!manualExpenseId || matching}
                      onClick={() => manualExpenseId && matchExpense(manualExpenseId)}
                    >
                      {matching ? "处理中..." : "关联"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                className="h-11 rounded-xl bg-primary/90 px-4 text-xs font-semibold text-white shadow-sm hover:shadow disabled:bg-primary/40 disabled:cursor-not-allowed"
                onClick={saveReceiptFields}
                disabled={saving}
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <button
                className="h-11 rounded-xl bg-danger/90 px-4 text-xs font-semibold text-white shadow-sm hover:bg-danger disabled:bg-danger/40 disabled:cursor-not-allowed"
                onClick={() => onDelete(receipt.receiptId)}
                disabled={saving}
              >
                删除票据
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SwipeAction>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );
}

function DocumentIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5" />
      <path d="M9 14l2.5 2.5L15 13" />
    </svg>
  );
}
