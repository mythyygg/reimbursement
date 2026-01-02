"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api";
import BottomNav from "../../../../components/BottomNav";
import SwipeAction from "../../../../components/SwipeAction";

type ExportRecord = {
  exportId: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
};

type BatchWithExport = {
  batchId: string;
  name: string | null;
  createdAt: string;
  issueSummaryJson: {
    missing_receipt?: number;
    duplicate_receipt?: number;
  } | null;
  latestExport?: ExportRecord;
};

export default function BatchesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [exportingBatchIds, setExportingBatchIds] = useState<Set<string>>(new Set());
  const [downloadingExportIds, setDownloadingExportIds] = useState<Set<string>>(new Set());
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const { data, refetch } = useQuery({
    queryKey: ["batches", projectId],
    queryFn: async () => {
      const batches = await apiFetch(`/projects/${projectId}/batches`);
      // Fetch latest export for each batch
      const batchesWithExports = await Promise.all(
        (batches as any[]).map(async (batch) => {
          try {
            const exports = await apiFetch(`/batches/${batch.batchId}/exports`);
            const latestExport = (exports as ExportRecord[]).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];
            return { ...batch, latestExport };
          } catch {
            return batch;
          }
        })
      );
      return batchesWithExports as BatchWithExport[];
    },
  });

  const batches = Array.isArray(data) ? data : [];

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach((timer) => clearInterval(timer));
    };
  }, []);

  const startPolling = useCallback((batchId: string, exportId: string) => {
    // Clear existing polling for this batch
    const existingTimer = pollingRef.current.get(batchId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const timer = setInterval(async () => {
      try {
        const record = await apiFetch<ExportRecord>(`/exports/${exportId}`);
        if (record.status === "completed" || record.status === "failed") {
          clearInterval(timer);
          pollingRef.current.delete(batchId);
          setExportingBatchIds((prev) => {
            const next = new Set(prev);
            next.delete(batchId);
            return next;
          });
          await refetch();
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000);

    pollingRef.current.set(batchId, timer);
  }, [refetch]);

  const createBatch = async () => {
    await apiFetch(`/projects/${projectId}/batches`, { method: "POST" });
    await refetch();
  };

  const deleteBatch = async (batchId: string) => {
    try {
      await apiFetch(`/batches/${batchId}`, { method: "DELETE" });
      await refetch();
    } catch (error: any) {
      console.error("删除失败:", error);
      if (error.message?.includes("BATCH_HAS_EXPORTS")) {
        alert("导出包含文件记录，请先删除所有导出文件");
      } else {
        alert("删除失败，请重试");
      }
    }
  };

  const createExport = async (batchId: string) => {
    try {
      setExportingBatchIds((prev) => new Set(prev).add(batchId));
      const record = await apiFetch<ExportRecord>(`/batches/${batchId}/exports`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      startPolling(batchId, record.exportId);
      await refetch();
    } catch (error) {
      console.error("创建导出失败:", error);
      setExportingBatchIds((prev) => {
        const next = new Set(prev);
        next.delete(batchId);
        return next;
      });
      alert("创建导出失败，请重试");
    }
  };

  const downloadExport = async (exportId: string) => {
    try {
      setDownloadingExportIds((prev) => new Set(prev).add(exportId));
      const result = await apiFetch<{ signed_url: string }>(
        `/exports/${exportId}/download-url`,
        { method: "POST" }
      );
      window.location.href = result.signed_url;
    } catch (error) {
      console.error("下载失败:", error);
      alert("下载失败，请重试");
    } finally {
      setTimeout(() => {
        setDownloadingExportIds((prev) => {
          const next = new Set(prev);
          next.delete(exportId);
          return next;
        });
      }, 1000);
    }
  };

  const getExportButton = (batch: BatchWithExport) => {
    const isExporting = exportingBatchIds.has(batch.batchId);
    const latestExport = batch.latestExport;

    // Check if there's an in-progress export
    if (isExporting || latestExport?.status === "pending" || latestExport?.status === "running") {
      // Start polling if not already
      if (latestExport && !pollingRef.current.has(batch.batchId)) {
        startPolling(batch.batchId, latestExport.exportId);
        setExportingBatchIds((prev) => new Set(prev).add(batch.batchId));
      }
      return (
        <button
          disabled
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium border border-blue-200"
        >
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          生成中...
        </button>
      );
    }

    // Export completed - show download button
    if (latestExport?.status === "completed") {
      const isDownloading = downloadingExportIds.has(latestExport.exportId);
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            downloadExport(latestExport.exportId);
          }}
          disabled={isDownloading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium shadow-sm hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {isDownloading ? "下载中..." : "下载报告"}
        </button>
      );
    }

    // Export failed or no export - show create button
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          createExport(batch.batchId);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-1 text-text-primary text-xs font-medium border border-border hover:bg-surface-2 active:scale-95 transition-all"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
        {latestExport?.status === "failed" ? "重新导出" : "生成报告"}
      </button>
    );
  };

  return (
    <div className="pb-24 bg-gradient-to-b from-surface-0 via-surface-1/40 to-surface-1">
      <div className="rounded-3xl bg-white border border-border p-6 shadow-card mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="text-lg font-bold text-text-primary">导出管理</div>
            <div className="text-xs text-text-secondary mt-1">
              创建导出后可生成包含费用清单和票据的报销报告
            </div>
          </div>
        </div>
        <button
          className="h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:scale-95 transition-all"
          onClick={createBatch}
        >
          <span className="flex items-center justify-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            创建新导出
          </span>
        </button>
      </div>

      <div className="space-y-4">
        {batches.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border bg-surface-0 p-8 text-center shadow-sm">
            <div className="text-sm text-text-secondary font-medium">暂无导出</div>
            <div className="text-xs text-text-tertiary mt-1">点击上方按钮创建第一个导出</div>
          </div>
        ) : null}
        {batches.map((batch, index) => {
          const issueSummary = batch.issueSummaryJson || {};
          const missingCount = issueSummary.missing_receipt ?? 0;
          const duplicateCount = issueSummary.duplicate_receipt ?? 0;
          const hasIssues = missingCount > 0 || duplicateCount > 0;

          return (
            <SwipeAction key={batch.batchId} onDelete={() => deleteBatch(batch.batchId)}>
              <div
                className="rounded-3xl border border-border bg-white p-5 shadow-card hover:shadow-card-hover transition-all animate-fade-up"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-text-primary truncate">
                      {batch.name || `导出 #${batch.batchId.slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
                      创建于 {new Date(batch.createdAt).toLocaleDateString("zh-CN")}
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

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs">
                    {batch.issueSummaryJson ? (
                      <>
                        {missingCount > 0 ? (
                          <div className="flex items-center gap-1.5 text-danger">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span className="font-medium">缺票 {missingCount} 条</span>
                          </div>
                        ) : null}
                        {duplicateCount > 0 ? (
                          <div className="flex items-center gap-1.5 text-warning">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span className="font-medium">重复 {duplicateCount} 条</span>
                          </div>
                        ) : null}
                        {!hasIssues ? (
                          <div className="flex items-center gap-1.5 text-success">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <span className="font-medium">无异常</span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-text-secondary">检查中...</div>
                    )}
                  </div>
                  {getExportButton(batch)}
                </div>
              </div>
            </SwipeAction>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
}
