"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "../../components/BottomNav";
import ProjectCard from "../../components/ProjectCard";
import { ProjectListSkeleton } from "../../components/Skeleton";
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

  const { showSuccess, showToast } = useToast();
  const { handleError } = useErrorHandler();

  const { data, refetch, isLoading } = useQuery({
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
        showToast("项目包含数据，请先删除所有费用和票据", "error");
      } else {
        handleError(error, "删除项目失败");
      }
    }
  };

  const projects = (Array.isArray(data) ? data : []).filter(
    (p) => p && p.name && p.name.trim() !== ""
  );

  const pinnedProjects = projects.filter((p: any) => p.pinned);
  const recentProjects = projects.filter((p: any) => !p.pinned);

  return (
    <div className="min-h-screen bg-surface-1 pb-24 lg:pb-10">
      <div className="mx-auto max-w-5xl px-5 pt-6 lg:px-8">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-text-primary">项目</h1>
          <button
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-all duration-200 ease-out active:scale-95 shadow-soft cursor-pointer"
            onClick={() => {
              setShowForm((prev) => !prev);
            }}
          >
            + 新建
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-6">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
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
            className="h-12 w-full rounded-xl border border-border bg-surface-0 pl-11 pr-11 text-sm placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all duration-200 shadow-soft"
            placeholder="搜索项目名称或项目号..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-surface-2 rounded-full transition-colors duration-200 cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* 新建表单 */}
        {showForm && (
          <div className="mb-6 rounded-2xl bg-surface-0 border border-border p-5 shadow-soft animate-fade-up">
            <div className="flex flex-col gap-3.5">
              <div>
                <input
                  className={`h-12 w-full rounded-xl border px-4 text-sm transition-all duration-200 focus:outline-none focus:ring-2 ${
                    nameError
                      ? "border-danger bg-danger-light/50 focus:border-danger focus:ring-danger/20"
                      : "border-border bg-surface-1 focus:border-primary focus:ring-primary/20"
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
                className="h-12 w-full rounded-xl border border-border px-4 text-sm bg-surface-1 transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="项目描述（可选）"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
              <button
                className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-out shadow-soft cursor-pointer"
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
          {isLoading ? (
            <ProjectListSkeleton />
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-text-secondary mb-1">还没有项目</p>
              <p className="text-xs text-text-tertiary">点击"新建"按钮创建第一个项目</p>
            </div>
          ) : (
            <>
              {/* 置顶项目 */}
              {pinnedProjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                      <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
                    </svg>
                    <h2 className="text-sm font-bold text-text-primary">置顶项目</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pinnedProjects.map((project: any) => (
                      <ProjectCard
                        key={project.projectId}
                        project={project}
                        isSelectMode={false}
                        isSelected={false}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {recentProjects.map((project: any) => (
                      <ProjectCard
                        key={project.projectId}
                        project={project}
                        isSelectMode={false}
                        isSelected={false}
                        onDelete={() => deleteProject(project.projectId)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
