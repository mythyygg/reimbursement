"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.projectId as string;
  const tabs = [
    { href: `/projects/${projectId}/expenses`, label: "报销单" },
    { href: `/projects/${projectId}/receipts`, label: "票据" },
    { href: `/projects/${projectId}/batches`, label: "导出" }
  ];

  useEffect(() => {
    localStorage.setItem("last_project_id", projectId);
  }, [projectId]);

  return (
    <div className="min-h-screen bg-surface-1 pb-20">
      <div className="mx-auto max-w-md px-4 pt-5">
        <div className="flex items-center justify-between mb-4">
          <Link href="/projects" className="text-sm text-text-secondary">
            返回
          </Link>
          <Link
            href={`/projects/${projectId}/batches`}
            className="rounded-full bg-surface-0 px-3 py-1 text-xs text-text-secondary"
          >
            导出
          </Link>
        </div>
        <div className="flex gap-2 mb-4">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-4 py-2 text-xs ${
                pathname === tab.href ? "bg-primary text-white" : "bg-surface-0 text-text-secondary"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
