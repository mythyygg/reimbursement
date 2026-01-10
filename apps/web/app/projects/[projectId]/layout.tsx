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
    { href: `/projects/${projectId}/batches`, label: "明细" }
  ];

  useEffect(() => {
    localStorage.setItem("last_project_id", projectId);
  }, [projectId]);

  return (
    <div className="min-h-screen bg-surface-1 pb-20 lg:pb-10">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Link href="/projects" className="text-sm text-text-secondary">
            返回
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 mb-5">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                pathname === tab.href ? "bg-primary text-white" : "bg-surface-0 text-text-secondary hover:text-text-primary"
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
