"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api";
import BottomNav from "../../../../components/BottomNav";

export default function BatchesPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { data, refetch } = useQuery({
    queryKey: ["batches", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/batches`)
  });

  const batches = Array.isArray(data) ? data : [];

  const createBatch = async () => {
    await apiFetch(`/projects/${projectId}/batches`, {
      method: "POST",
    });
    await refetch();
  };

  return (
    <div className="pb-24 bg-gradient-to-b from-surface-0 via-surface-1/40 to-surface-1">
      <div className="rounded-3xl bg-white border border-border p-6 shadow-card mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="text-lg font-bold text-text-primary">批次管理</div>
            <div className="text-xs text-text-secondary mt-1">
              创建批次后可导出报销清单和票据
            </div>
          </div>
        </div>
        <button
          className="h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all"
          onClick={createBatch}
        >
          <span className="flex items-center justify-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            创建新批次
          </span>
        </button>
      </div>

      <div className="space-y-4">
        {batches.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border bg-surface-0 p-8 text-center shadow-sm">
            <div className="text-sm text-text-secondary font-medium">暂无批次</div>
            <div className="text-xs text-text-tertiary mt-1">点击上方按钮创建第一个批次</div>
          </div>
        ) : null}
        {batches.map((batch: any, index: number) => {
          const issueSummary = batch.issueSummaryJson || {};
          const missingCount = issueSummary.missing_receipt ?? 0;
          const duplicateCount = issueSummary.duplicate_receipt ?? 0;
          const hasIssues = missingCount > 0 || duplicateCount > 0;

          return (
            <Link
              key={batch.batchId}
              href={`/batches/${batch.batchId}`}
              className="block rounded-3xl border border-border bg-white p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all animate-fade-up"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-text-primary truncate">{batch.name || `批次 #${batch.batchId.slice(0, 8)}`}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    创建于 {new Date(batch.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                {hasIssues ? (
                  <span className="shrink-0 rounded-full bg-warning-light px-3 py-1 text-xs font-bold text-warning border border-warning/20">
                    需处理
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-success-light px-3 py-1 text-xs font-bold text-success border border-success/20">
                    已就绪
                  </span>
                )}
              </div>

              {batch.issueSummaryJson ? (
                <div className="flex items-center gap-4 text-xs">
                  {missingCount > 0 ? (
                    <div className="flex items-center gap-1.5 text-danger">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                      </svg>
                      <span className="font-medium">缺票 {missingCount} 条</span>
                    </div>
                  ) : null}
                  {duplicateCount > 0 ? (
                    <div className="flex items-center gap-1.5 text-warning">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <span className="font-medium">重复 {duplicateCount} 条</span>
                    </div>
                  ) : null}
                  {!hasIssues ? (
                    <div className="flex items-center gap-1.5 text-success">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                      <span className="font-medium">无异常</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-text-secondary">检查中...</div>
              )}
            </Link>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
