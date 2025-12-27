"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import BottomNav from "../../../components/BottomNav";
import SwipeAction from "../../../components/SwipeAction";

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.batchId as string;
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [ongoingExportType, setOngoingExportType] = useState<string | null>(null);
  const [latestExports, setLatestExports] = useState<any[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => apiFetch(`/batches/${batchId}`)
  });

  const batch = data as any;

  // 加载最近的导出记录
  useEffect(() => {
    loadRecentExports();
  }, [batchId]);

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const loadRecentExports = async () => {
    try {
      const exports = await apiFetch(`/batches/${batchId}/exports`);
      setLatestExports(exports as any[]);

      // 检查是否有正在进行的任务
      const ongoingTask = (exports as any[]).find(
        (exp) => exp.status === "pending" || exp.status === "running"
      );

      if (ongoingTask) {
        // 有正在进行的任务，开始轮询
        setExportId(ongoingTask.exportId);
        setOngoingExportType(ongoingTask.type);
        setIsPolling(true);

        // 清除之前的轮询
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }

        // 立即检查一次
        await pollExportStatus(ongoingTask.exportId);

        // 每2秒轮询一次
        pollingIntervalRef.current = setInterval(() => {
          pollExportStatus(ongoingTask.exportId);
        }, 2000);
      } else {
        // 没有正在进行的任务
        setOngoingExportType(null);
      }
    } catch (error) {
      console.error("加载导出记录失败:", error);
    }
  };

  const runCheck = async () => {
    await apiFetch(`/batches/${batchId}/check`, { method: "POST" });
    await refetch();
  };

  const pollExportStatus = async (exportId: string) => {
    try {
      const record = await apiFetch<any>(`/exports/${exportId}`);

      if (record.status === "done") {
        setExportStatus("✓ 导出完成！可以下载了");
        setIsPolling(false);
        setOngoingExportType(null);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }

        // 刷新导出列表
        await loadRecentExports();

        // 3秒后清除状态提示
        setTimeout(() => setExportStatus(null), 3000);
      } else if (record.status === "failed") {
        setExportStatus("✗ 导出失败，请重试");
        setIsPolling(false);
        setOngoingExportType(null);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        // 刷新导出列表显示失败状态
        await loadRecentExports();
      } else if (record.status === "running") {
        setExportStatus("正在生成文件...");
      } else {
        setExportStatus("等待处理...");
      }
    } catch (error) {
      console.error("轮询导出状态失败:", error);
    }
  };

  const createExport = async (type: "csv" | "zip") => {
    try {
      setExportStatus("创建导出任务...");
      const record = await apiFetch<any>(`/batches/${batchId}/exports`, {
        method: "POST",
        body: JSON.stringify({ type })
      });

      setExportId(record.exportId);
      setOngoingExportType(type);
      setExportStatus("等待处理...");
      setIsPolling(true);

      // 立即刷新导出列表，显示新创建的任务
      await loadRecentExports();

      // 清除之前的轮询
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      // 立即检查一次
      await pollExportStatus(record.exportId);

      // 每2秒轮询一次
      pollingIntervalRef.current = setInterval(() => {
        pollExportStatus(record.exportId);
      }, 2000);
    } catch (error) {
      console.error("创建导出失败:", error);
      setExportStatus("创建导出失败");
      setOngoingExportType(null);
    }
  };

  const downloadExport = async (targetExportId?: string) => {
    const idToDownload = targetExportId || exportId;
    if (!idToDownload) {
      setExportStatus("没有可用的导出");
      return;
    }

    try {
      const record = await apiFetch<any>(`/exports/${idToDownload}`);
      if (record.status !== "done") {
        setExportStatus(`当前状态：${record.status === "pending" ? "等待处理" : record.status === "running" ? "处理中" : record.status}`);
        return;
      }
      const download = await apiFetch<any>(`/exports/${idToDownload}/download-url`, {
        method: "POST"
      });

      // PWA环境下直接导航到下载链接
      console.log("开始下载:", download.signed_url);
      window.location.href = download.signed_url;

      setExportStatus("下载已开始");
      setTimeout(() => setExportStatus(null), 3000);
    } catch (error) {
      console.error("下载失败:", error);
      setExportStatus("下载失败");
    }
  };

  const deleteExport = async (exportId: string) => {
    try {
      await apiFetch(`/exports/${exportId}`, { method: "DELETE" });
      await loadRecentExports();
    } catch (error: any) {
      console.error("删除失败:", error);
      if (error.message?.includes("EXPORT_IN_PROGRESS")) {
        alert("无法删除进行中的导出任务");
      } else {
        alert("删除失败，请重试");
      }
    }
  };

  if (!batch) {
    return (
      <div className="min-h-screen bg-surface-1 p-6">
        <button className="text-sm text-text-secondary" onClick={() => router.back()}>
          返回
        </button>
        <div className="mt-6 text-sm text-text-secondary">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1 p-6 pb-20">
      <button className="text-sm text-text-secondary" onClick={() => router.back()}>
        返回
      </button>
      <div className="mt-4 rounded-2xl bg-surface-0 p-4 shadow-sm">
        <div className="text-base font-semibold">{batch.name}</div>
        <div className="text-xs text-text-secondary mt-1">
          {batch.issueSummaryJson
            ? `缺少 ${batch.issueSummaryJson.missing_receipt ?? 0} • 重复 ${batch.issueSummaryJson.duplicate_receipt ?? 0} • 金额不匹配 ${batch.issueSummaryJson.amount_mismatch ?? 0}`
            : "检查中..."}
        </div>
        <button className="mt-3 rounded-xl bg-surface-1 px-4 py-2 text-xs" onClick={runCheck}>
          重新检查
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="text-sm font-semibold text-text-primary">导出文件</div>

        {/* 历史导出记录 */}
        {latestExports.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-text-secondary">历史导出</div>
            {latestExports.slice(0, 5).map((record) => (
              <SwipeAction
                key={record.exportId}
                onDelete={() => deleteExport(record.exportId)}
              >
                <div className="rounded-xl bg-surface-0 border border-border p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {record.type === "zip" ? "完整包（ZIP）" : record.type === "csv" ? "清单（CSV）" : "其他"}
                    </div>
                    <div className="text-xs text-text-tertiary mt-1">
                      {new Date(record.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.status === "done" && (
                      <button
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium"
                        onClick={() => downloadExport(record.exportId)}
                      >
                        下载
                      </button>
                    )}
                    {record.status === "pending" && (
                      <span className="text-xs text-blue-600">等待中</span>
                    )}
                    {record.status === "running" && (
                      <span className="text-xs text-blue-600">生成中...</span>
                    )}
                    {record.status === "failed" && (
                      <span className="text-xs text-red-600">失败</span>
                    )}
                  </div>
                </div>
              </SwipeAction>
            ))}
          </div>
        )}

        {/* 创建新导出 */}
        <div className="pt-2">
          <div className="text-xs text-text-secondary mb-2">创建新导出</div>
          <button
            className="w-full h-12 rounded-xl bg-primary text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => createExport("zip")}
            disabled={isPolling}
          >
            {isPolling && ongoingExportType === "zip"
              ? "ZIP生成中..."
              : isPolling
              ? "其他任务进行中..."
              : "导出完整包（ZIP）"}
          </button>

          <button
            className="mt-2 w-full h-12 rounded-xl bg-surface-0 border border-border text-sm font-medium text-text-primary disabled:opacity-50"
            onClick={() => createExport("csv")}
            disabled={isPolling}
          >
            {isPolling && ongoingExportType === "csv"
              ? "CSV生成中..."
              : isPolling
              ? "其他任务进行中..."
              : "仅导出清单（CSV）"}
          </button>
        </div>

        {exportStatus && (
          <div className={`text-xs rounded-xl p-3 ${
            exportStatus.includes('✓') ? 'bg-green-50 text-green-700 border border-green-200' :
            exportStatus.includes('✗') ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {exportStatus}
          </div>
        )}

        <div className="text-xs text-text-tertiary pt-2">
          <p>• ZIP包含：CSV清单 + YAML索引 + 所有票据</p>
          <p>• CSV仅包含：费用清单表格</p>
          <p>• 导出后可以离开页面，Worker会继续处理</p>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
