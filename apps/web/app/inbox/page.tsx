"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "../../components/BottomNav";
import { apiFetch } from "../../lib/api";

export default function InboxPage() {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    setProjectId(localStorage.getItem("last_project_id"));
  }, []);

  const { data } = useQuery({
    queryKey: ["inbox", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/receipts`),
    enabled: Boolean(projectId)
  });

  const receipts = Array.isArray(data) ? data : [];

  return (
    <div className="min-h-screen bg-surface-1 pb-20">
      <div className="mx-auto max-w-md px-4 pt-6">
        <h1 className="text-xl font-semibold mb-4">收件箱</h1>
        {!projectId ? (
          <div className="rounded-2xl bg-surface-0 p-6 text-sm text-text-secondary">
            打开一个项目以查看票据。
          </div>
        ) : (
          <div className="space-y-3">
            {receipts.length === 0 ? (
              <div className="rounded-2xl bg-surface-0 p-6 text-sm text-text-secondary">
                该项目暂无票据。
              </div>
            ) : null}
            {receipts.map((receipt: any) => (
              <Link
                key={receipt.receiptId}
                href={`/projects/${projectId}/receipts`}
                className="block rounded-2xl bg-surface-0 p-4 shadow-sm"
              >
                <div className="text-sm font-semibold">{receipt.receiptId.slice(0, 6)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
