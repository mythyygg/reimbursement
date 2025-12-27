"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import BottomNav from "../../components/BottomNav";
import { apiFetch } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { useErrorHandler } from "../../lib/useErrorHandler";

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // 使用简单的日期格式化，避免 locale 依赖
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState("");

  // 多选状态
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { showSuccess, showToast } = useToast();
  const { handleError } = useErrorHandler();

  const { data, refetch } = useQuery({
    queryKey: ["projects", search],
    queryFn: () => apiFetch(`/projects?search=${encodeURIComponent(search)}`)
  });

  const createProject = async () => {
    // 前端验证
    if (!name.trim()) {
      setNameError("项目名称不能为空");
      return;
    }

    setCreating(true);
    try {
      await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined
        })
      });
      setName("");
      setDescription("");
      setShowForm(false);
      setNameError("");
      await refetch();
      showSuccess("项目创建成功");
    } catch (error) {
      handleError(error, "创建项目失败");
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async (type: "csv" | "zip" | "pdf") => {
    if (selectedIds.length === 0) return;

    setExporting(true);
    try {
      await apiFetch("/projects/exports", {
        method: "POST",
        body: JSON.stringify({
          type,
          projectIds: selectedIds
        })
      });
      showToast("导出任务已提交，请稍后在设置中查看导出历史", "info");
      setIsSelectMode(false);
      setSelectedIds([]);
      setShowExportOptions(false);
    } catch (error) {
      handleError(error, "提交导出失败");
    } finally {
      setExporting(false);
    }
  };

  const toggleSelect = (projectId: string) => {
    setSelectedIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const projects = (Array.isArray(data) ? data : []).filter(
    (p) => p && p.name && p.name.trim() !== ""
  );

  return (
    <div className="min-h-screen bg-surface-1 pb-24">
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold">项目</h1>
            <p className="text-xs text-text-secondary mt-1">按项目跟踪报销</p>
          </div>
          <div className="flex gap-2">
            {!showForm && (
              <button
                className={`rounded-full px-4 py-2 text-sm transition shadow-sm hover:shadow-md ${isSelectMode ? "bg-surface-0 border border-border text-text-primary" : "bg-surface-0 border border-border text-text-secondary"
                  }`}
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedIds([]);
                }}
              >
                {isSelectMode ? "取消" : "选择"}
              </button>
            )}
            <button
              className="rounded-full bg-primary px-4 py-2 text-sm text-white shadow-sm transition hover:shadow-md"
              onClick={() => {
                setShowForm((prev) => !prev);
                if (isSelectMode) setIsSelectMode(false);
              }}
              aria-label={showForm ? "关闭新建项目表单" : "打开新建项目表单"}
            >
              新建
            </button>
          </div>
        </div>

        {!isSelectMode && (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.2-4.2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              className="h-11 w-full rounded-full border border-border bg-surface-0 pl-10 pr-3 text-sm transition focus:border-primary/40"
              placeholder="搜索项目"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="搜索项目"
            />
          </div>
        )}

        {showForm ? (
          <div className="mt-4 rounded-2xl bg-surface-0 p-4 shadow-sm animate-scale-in">
            <div className="flex flex-col gap-3">
              <div>
                <input
                  className={`h-11 w-full rounded-xl border px-3 text-sm ${nameError ? "border-danger" : "border-border"
                    }`}
                  placeholder="项目名称"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (nameError) setNameError("");
                  }}
                  aria-label="项目名称"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? "name-error" : undefined}
                />
                {nameError ? (
                  <p id="name-error" className="mt-1 text-xs text-danger">
                    {nameError}
                  </p>
                ) : null}
              </div>
              <input
                className="h-11 w-full rounded-xl border border-border px-3 text-sm"
                placeholder="项目描述（可选）"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="项目描述"
              />
              <button
                className="h-11 w-full rounded-xl bg-primary text-sm text-white shadow-sm transition hover:shadow-md disabled:bg-primary/40 disabled:cursor-not-allowed"
                onClick={createProject}
                disabled={creating}
              >
                {creating ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-0 p-6 text-sm text-text-secondary">
              暂无项目，先创建一个吧。
            </div>
          ) : null}
          {projects.map((project: any, index: number) => {
            const isSelected = selectedIds.includes(project.projectId);

            const content = (
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="text-base font-semibold truncate">{project.name}</div>
                  <div className="flex items-center gap-3 text-[11px] text-text-secondary">
                    <span>{formatDate(project.createdAt)}</span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1 w-1 rounded-full bg-border" />
                      报销单 {project.receiptCount ?? 0}
                    </span>
                  </div>
                  {project.description ? (
                    <div className="text-[11px] text-text-secondary truncate">{project.description}</div>
                  ) : null}
                </div>
                {isSelectMode ? (
                  <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-border"
                    }`}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                ) : (
                  project.pinned ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      置顶
                    </span>
                  ) : null
                )}
              </div>
            );

            if (isSelectMode) {
              return (
                <div
                  key={project.projectId}
                  onClick={() => toggleSelect(project.projectId)}
                  className={`block rounded-2xl border p-4 shadow-sm transition cursor-pointer active:scale-[0.98] ${isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border bg-surface-0"
                    }`}
                >
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={project.projectId}
                href={`/projects/${project.projectId}/expenses`}
                className="block rounded-2xl border border-border bg-surface-0 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md animate-fade-up"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                {content}
                {Array.isArray(project.tags) && project.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.tags.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-surface-1 px-2 py-0.5 text-[10px] text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      {/* 导出操作栏 */}
      {isSelectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-3 animate-slide-up">
          <button
            onClick={() => setShowExportOptions(true)}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-white shadow-lg active:scale-95 transition"
          >
            导出 {selectedIds.length} 个项目
          </button>
        </div>
      )}

      {/* 导出选项弹窗 */}
      {showExportOptions && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm px-4 pb-12 animate-fade-in" onClick={() => setShowExportOptions(false)}>
          <div className="w-full max-w-md bg-surface-0 rounded-3xl p-6 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">导出选项</h2>
              <button
                onClick={() => setShowExportOptions(false)}
                className="rounded-full p-2 hover:bg-surface-1 transition"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <button
                disabled={exporting}
                onClick={() => handleExport("csv")}
                className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-surface-1 hover:bg-surface-2 transition group"
              >
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center text-success group-hover:bg-success group-hover:text-white transition">
                  CSV
                </div>
                <span className="text-xs font-medium">Excel报表</span>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport("zip")}
                className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-surface-1 hover:bg-surface-2 transition group"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition">
                  ZIP
                </div>
                <span className="text-xs font-medium">压缩包(含票据)</span>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport("pdf")}
                className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-surface-1 hover:bg-surface-2 transition group"
              >
                <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center text-danger group-hover:bg-danger group-hover:text-white transition">
                  PDF
                </div>
                <span className="text-xs font-medium">打印存档</span>
              </button>
            </div>
            <button
              onClick={() => setShowExportOptions(false)}
              className="mt-6 w-full py-3 text-sm text-text-secondary font-medium"
            >
              再想想
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
