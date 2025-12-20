"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "../../../../lib/api";
import BottomNav from "../../../../components/BottomNav";

const statusOptions = ["matched", "missing_receipt", "no_receipt_required"];

export default function BatchesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [name, setName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statuses, setStatuses] = useState<string[]>(["matched"]);

  const { data, refetch } = useQuery({
    queryKey: ["batches", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/batches`)
  });

  const batches = Array.isArray(data) ? data : [];

  const toggleStatus = (status: string) => {
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((item) => item !== status) : [...prev, status]
    );
  };

  const createBatch = async () => {
    await apiFetch(`/projects/${projectId}/batches`, {
      method: "POST",
      body: JSON.stringify({
        name: name || undefined,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to: dateTo ? new Date(dateTo).toISOString() : undefined,
        statuses
      })
    });
    setName("");
    setDateFrom("");
    setDateTo("");
    await refetch();
  };

  return (
    <div className="pb-24">
      <div className="rounded-2xl bg-surface-0 p-4 shadow-sm mb-4">
        <div className="text-sm font-semibold mb-2">新建批次</div>
        <div className="space-y-2">
          <input
            className="h-10 w-full rounded-xl border border-border px-3 text-sm"
            placeholder="批次名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="h-10 flex-1 rounded-xl border border-border px-3 text-sm"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <input
              className="h-10 flex-1 rounded-xl border border-border px-3 text-sm"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                className={`rounded-full px-3 py-1 text-xs ${
                  statuses.includes(status) ? "bg-primary text-white" : "bg-surface-1 text-text-secondary"
                }`}
                onClick={() => toggleStatus(status)}
              >
                {{
                  matched: "已关联",
                  missing_receipt: "缺少票据",
                  no_receipt_required: "无需票据"
                }[status]}
              </button>
            ))}
          </div>
          <button className="h-10 w-full rounded-xl bg-primary text-sm text-white" onClick={createBatch}>
            生成检查
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {batches.length === 0 ? (
          <div className="rounded-2xl bg-surface-0 p-6 text-sm text-text-secondary">
            暂无批次。
          </div>
        ) : null}
        {batches.map((batch: any) => (
          <Link
            key={batch.batchId}
            href={`/batches/${batch.batchId}`}
            className="block rounded-2xl bg-surface-0 p-4 shadow-sm"
          >
            <div className="text-sm font-semibold">{batch.name}</div>
            <div className="text-xs text-text-secondary mt-1">
              {batch.issueSummaryJson
                ? `缺少 ${batch.issueSummaryJson.missing_receipt ?? 0} • 重复 ${batch.issueSummaryJson.duplicate_receipt ?? 0}`
                : "检查中..."}
            </div>
          </Link>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
