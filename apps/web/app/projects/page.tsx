"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "../../components/BottomNav";
import ProjectCard from "../../components/ProjectCard";
import { apiFetch } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { useErrorHandler } from "../../lib/useErrorHandler";

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState("");
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

  const deleteProject = async (projectId: string) => {
    try {
      await apiFetch(`/projects/${projectId}`, { method: "DELETE" });
      await refetch();
      showSuccess("项目已删除");
    } catch (error: any) {
      if (error.message?.includes("PROJECT_HAS_DATA")) {
        showToast("项目包含数据，请先删除所有费用、票据和导出", "error");
      } else {
        handleError(error, "删除项目失败");
      }
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
      showToast("导出任务已提交，请稍后在导出记录中查看", "info");
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

  const pinnedProjects = projects.filter((p: any) => p.pinned);
  const recentProjects = projects.filter((p: any) => !p.pinned);

  return (
    <div className="min-h-screen bg-surface-1 pb-24">
      <div className="mx-auto max-w-2xl px-5 pt-6">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-text-primary">项目</h1>
          <div className="flex gap-2.5">
            {!showForm && (
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  isSelectMode
                    ? "bg-surface-0 border border-border text-text-secondary"
                    : "bg-surface-0 border border-border text-text-secondary hover:border-primary/40"
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
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-all active:scale-95 shadow-sm"
              onClick={() => {
                setShowForm((prev) => !prev);
                if (isSelectMode) setIsSelectMode(false);
              }}
            >
              + 新建
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        {!isSelectMode && (
          <div className="relative mb-6">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="h-11 w-full rounded-full border border-border bg-surface-0 pl-11 pr-4 text-sm placeholder:text-text-tertiary focus:border-primary focus:outline-none transition-all"
              placeholder="搜索项目名称或项目号..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-2 rounded-full transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* 新建表单 */}
        {showForm && (
          <div className="mb-6 rounded-2xl bg-surface-0 border border-border p-5 shadow-sm">
            <div className="flex flex-col gap-3.5">
              <div>
                <input
                  className={`h-11 w-full rounded-xl border px-4 text-sm transition-all focus:outline-none focus:border-primary ${
                    nameError ? "border-danger bg-danger-light/50" : "border-border bg-surface-1"
                  }`}
                  placeholder="项目名称"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (nameError) setNameError("");
                  }}
                />
                {nameError && (
                  <p className="mt-1.5 text-xs text-danger font-medium">{nameError}</p>
                )}
              </div>
              <input
                className="h-11 w-full rounded-xl border border-border px-4 text-sm bg-surface-1 transition-all focus:outline-none focus:border-primary"
                placeholder="项目描述（可选）"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <button
                className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-white hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                onClick={createProject}
                disabled={creating}
              >
                {creating ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}

        {/* 项目列表 */}
        <div className="space-y-5">
          {projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <p className="text-sm font-medium text-text-secondary">还没有项目</p>
              <p className="text-xs text-text-tertiary mt-1">点击"新建"按钮创建第一个项目</p>
            </div>
          )}

          {/* 置顶项目 */}
          {pinnedProjects.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                  <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
                </svg>
                <h2 className="text-sm font-bold text-text-primary">置顶项目</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pinnedProjects.map((project: any) => (
                  <ProjectCard
                    key={project.projectId}
                    project={project}
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.includes(project.projectId)}
                    onToggleSelect={() => toggleSelect(project.projectId)}
                    onDelete={() => deleteProject(project.projectId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 最近项目 */}
          {recentProjects.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <h2 className="text-sm font-bold text-text-primary">最近项目</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recentProjects.map((project: any) => (
                  <ProjectCard
                    key={project.projectId}
                    project={project}
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.includes(project.projectId)}
                    onToggleSelect={() => toggleSelect(project.projectId)}
                    onDelete={() => deleteProject(project.projectId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 导出操作栏 */}
      {isSelectMode && selectedIds.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2">
          <button
            onClick={() => setShowExportOptions(true)}
            className="flex items-center gap-2.5 rounded-full bg-primary px-8 py-4 text-sm font-bold text-white shadow-xl hover:bg-primary-hover active:scale-95 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            导出 {selectedIds.length} 个项目
          </button>
        </div>
      )}

      {/* 导出选项弹窗 */}
      {showExportOptions && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowExportOptions(false)}
        >
          <div
            className="w-full max-w-md bg-surface-0 rounded-t-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">选择导出格式</h2>
              <button
                onClick={() => setShowExportOptions(false)}
                className="rounded-full p-2 hover:bg-surface-2 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                disabled={exporting}
                onClick={() => handleExport("csv")}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-surface-1 hover:bg-surface-2 transition-all disabled:opacity-50"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-text-primary">CSV表格</span>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport("zip")}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-surface-1 hover:bg-surface-2 transition-all disabled:opacity-50"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 13v6a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-6" />
                    <polyline points="7 8 12 3 17 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-text-primary">ZIP压缩</span>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport("pdf")}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-surface-1 hover:bg-surface-2 transition-all disabled:opacity-50"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-text-primary">PDF文档</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
