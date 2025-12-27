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
    <div className="min-h-screen bg-gradient-to-b from-surface-0 via-surface-1 to-surface-1 pb-24">
      <div className="mx-auto max-w-md px-4 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">项目</h1>
            <p className="text-sm text-text-secondary mt-1.5">按项目跟踪报销进度</p>
          </div>
          <div className="flex gap-2">
            {!showForm && (
              <button
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  isSelectMode
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "bg-surface-0 border border-border text-text-secondary hover:border-primary/30 hover:text-text-primary shadow-sm hover:shadow-md"
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
              className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:scale-95"
              onClick={() => {
                setShowForm((prev) => !prev);
                if (isSelectMode) setIsSelectMode(false);
              }}
              aria-label={showForm ? "关闭新建项目表单" : "打开新建项目表单"}
            >
              + 新建
            </button>
          </div>
        </div>

        {!isSelectMode && (
          <div className="relative mb-6">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.2-4.2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              className="h-12 w-full rounded-2xl border border-border bg-surface-0 pl-11 pr-4 text-sm shadow-sm transition-all focus:border-primary focus:shadow-md focus:ring-4 focus:ring-primary/10 focus:outline-none"
              placeholder="搜索项目名称或描述..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="搜索项目"
            />
          </div>
        )}

        {showForm ? (
          <div className="mb-6 rounded-3xl bg-surface-0 border border-border p-5 shadow-lg animate-scale-in">
            <div className="flex flex-col gap-4">
              <div>
                <input
                  className={`h-12 w-full rounded-2xl border px-4 text-sm transition-all focus:ring-4 focus:ring-primary/10 focus:outline-none ${
                    nameError ? "border-danger focus:border-danger bg-danger-light" : "border-border focus:border-primary bg-surface-1"
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
                  <p id="name-error" className="mt-2 text-xs text-danger font-medium">
                    {nameError}
                  </p>
                ) : null}
              </div>
              <input
                className="h-12 w-full rounded-2xl border border-border px-4 text-sm bg-surface-1 transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none"
                placeholder="项目描述（可选）"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="项目描述"
              />
              <button
                className="h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:bg-primary/40 disabled:cursor-not-allowed disabled:shadow-none transition-all"
                onClick={createProject}
                disabled={creating}
              >
                {creating ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          {projects.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-border bg-surface-0 p-8 text-center shadow-sm">
              <div className="text-sm text-text-secondary font-medium">暂无项目</div>
              <div className="text-xs text-text-tertiary mt-1">点击"新建"按钮创建第一个项目</div>
            </div>
          ) : null}
          {projects.map((project: any, index: number) => {
            const isSelected = selectedIds.includes(project.projectId);

            const content = (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="text-base font-bold text-text-primary truncate">{project.name}</div>
                  <div className="flex items-center gap-2.5 text-xs text-text-secondary">
                    <span className="font-medium">{formatDate(project.createdAt)}</span>
                    <span className="h-1 w-1 rounded-full bg-border-strong" />
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      {project.receiptCount ?? 0} 张
                    </span>
                  </div>
                  {project.description ? (
                    <div className="text-xs text-text-tertiary line-clamp-1">{project.description}</div>
                  ) : null}
                </div>
                {isSelectMode ? (
                  <div className={`mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isSelected ? "bg-primary border-primary scale-110" : "border-border"
                  }`}>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                ) : (
                  project.pinned ? (
                    <span className="shrink-0 rounded-full bg-primary-light px-3 py-1 text-xs font-bold text-primary">
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
                  className={`block rounded-3xl border-2 p-5 transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary-light/30 shadow-lg shadow-primary/10"
                      : "border-border bg-surface-0 shadow-card hover:shadow-card-hover hover:border-primary/30"
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
                className="block rounded-3xl border border-border bg-surface-0 p-5 shadow-card transition-all hover:border-primary/40 hover:-translate-y-1 hover:shadow-card-hover animate-fade-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {content}
                {Array.isArray(project.tags) && project.tags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.tags.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-text-secondary"
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 animate-slide-up">
          <button
            onClick={() => setShowExportOptions(true)}
            className="flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-sm font-bold text-white shadow-xl shadow-primary/30 hover:bg-primary-hover hover:shadow-2xl hover:shadow-primary/40 active:scale-95 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            导出 {selectedIds.length} 个项目
          </button>
        </div>
      )}

      {/* 导出选项弹窗 */}
      {showExportOptions && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowExportOptions(false)}>
          <div className="w-full max-w-md bg-surface-0 rounded-t-4xl p-6 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">选择导出格式</h2>
              <button
                onClick={() => setShowExportOptions(false)}
                className="rounded-full p-2 hover:bg-surface-2 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                disabled={exporting}
                onClick={() => handleExport("csv")}
                className="flex flex-col items-center gap-3 p-5 rounded-3xl bg-success-light hover:bg-success hover:scale-105 transition-all group disabled:opacity-50"
              >
                <div className="h-14 w-14 rounded-2xl bg-success/20 flex items-center justify-center text-success group-hover:bg-white group-hover:text-white transition-all">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <span className="text-xs font-bold text-text-primary group-hover:text-success">CSV表格</span>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport("zip")}
                className="flex flex-col items-center gap-3 p-5 rounded-3xl bg-primary-light hover:bg-primary hover:scale-105 transition-all group disabled:opacity-50"
              >
                <div className="h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary group-hover:bg-white group-hover:text-white transition-all">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 13v6a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-6"></path>
                    <polyline points="7 8 12 3 17 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <span className="text-xs font-bold text-text-primary group-hover:text-primary">ZIP压缩</span>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport("pdf")}
                className="flex flex-col items-center gap-3 p-5 rounded-3xl bg-danger-light hover:bg-danger hover:scale-105 transition-all group disabled:opacity-50"
              >
                <div className="h-14 w-14 rounded-2xl bg-danger/20 flex items-center justify-center text-danger group-hover:bg-white group-hover:text-white transition-all">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                </div>
                <span className="text-xs font-bold text-text-primary group-hover:text-danger">PDF文档</span>
              </button>
            </div>
            <button
              onClick={() => setShowExportOptions(false)}
              className="mt-6 w-full py-3.5 text-sm text-text-secondary font-semibold hover:text-text-primary transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
