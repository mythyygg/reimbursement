"use client";

import Link from "next/link";
import { useState } from "react";

interface ProjectCardProps {
  project: any;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect?: () => void;
  onDelete?: () => void;
}

export default function ProjectCard({
  project,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onDelete,
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const formatDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}/${day}`;
  };

  const cardContent = (
    <div className="relative">
      {/* 项目编号和菜单 */}
      <div className="flex items-start justify-between mb-2.5">
        <span className="text-xs font-medium text-text-tertiary">
          {project.projectId || "PRJ-2024-001"}
        </span>
        {!isSelectMode && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-surface-2 rounded-lg transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-text-tertiary"
              >
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-surface-0 border border-border rounded-xl shadow-lg py-1 z-10">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete?.();
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-light/50 transition-colors"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )}
        {isSelectMode && (
          <div
            className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected
                ? "bg-primary border-primary"
                : "border-border-strong"
            }`}
          >
            {isSelected && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* 项目名称 */}
      <h3 className="text-base font-bold text-text-primary mb-2 line-clamp-1">
        {project.name}
      </h3>

      {/* 徽章 */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 缺票数 - 红色 */}
        {project.missingReceipts > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-light px-2.5 py-0.5 text-xs font-semibold text-danger">
            缺票 {project.missingReceipts}
          </span>
        )}
        {/* 票据数 - 灰色 */}
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          未导出 {project.receiptCount ?? 0}
        </span>
      </div>

      {/* 置顶标记 */}
      {project.pinned && !isSelectMode && (
        <div className="absolute top-0 right-0 -mt-1 -mr-1">
          <div className="bg-primary rounded-full p-1">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="white"
            >
              <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );

  if (isSelectMode) {
    return (
      <div
        onClick={onToggleSelect}
        className={`rounded-2xl border p-4 cursor-pointer transition-all ${
          isSelected
            ? "border-primary bg-primary-light/20 shadow-sm"
            : "border-border bg-surface-0 hover:border-primary/30"
        }`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      href={`/projects/${project.projectId}/expenses`}
      className="block rounded-2xl border border-border bg-surface-0 p-4 transition-all hover:border-primary/40 hover:shadow-sm"
      onClick={() => setShowMenu(false)}
    >
      {cardContent}
    </Link>
  );
}
