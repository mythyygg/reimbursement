"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api";
import BottomNav from "../../../components/BottomNav";

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.batchId as string;
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => apiFetch(`/batches/${batchId}`)
  });

  const batch = data as any;

  const runCheck = async () => {
    await apiFetch(`/batches/${batchId}/check`, { method: "POST" });
    await refetch();
  };

  const createExport = async (type: "csv" | "zip" | "pdf") => {
    setExportStatus("正在导出...");
    const record = await apiFetch<any>(`/batches/${batchId}/exports`, {
      method: "POST",
      body: JSON.stringify({ type })
    });
    setExportStatus(`导出已排队：${record.exportId}`);
    setExportId(record.exportId);
  };

  const downloadExport = async () => {
    if (!exportId) {
      return;
    }
    const record = await apiFetch<any>(`/exports/${exportId}`);
    if (record.status !== "done") {
      setExportStatus(`导出状态：${record.status}`);
      return;
    }
    const download = await apiFetch<any>(`/exports/${exportId}/download-url`, {
      method: "POST"
    });
    window.open(download.signed_url, "_blank");
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

      <div className="mt-4 grid gap-2">
        <button className="h-11 rounded-xl bg-primary text-sm text-white" onClick={() => createExport("csv")}>
          导出 CSV
        </button>
        <button className="h-11 rounded-xl bg-primary text-sm text-white" onClick={() => createExport("zip")}>
          导出 ZIP
        </button>
        <button className="h-11 rounded-xl bg-primary text-sm text-white" onClick={() => createExport("pdf")}>
          导出 PDF
        </button>
        <button className="h-11 rounded-xl bg-surface-0 text-sm" onClick={downloadExport}>
          下载最新导出
        </button>
        {exportStatus ? <div className="text-xs text-text-secondary">{exportStatus}</div> : null}
      </div>
      <BottomNav />
    </div>
  );
}
