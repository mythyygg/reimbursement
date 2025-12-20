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

  const { showSuccess } = useToast();
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

  const projects = (Array.isArray(data) ? data : []).filter(
    (p) => p && p.name && p.name.trim() !== ""
  );

  return (
    <div className="min-h-screen bg-surface-1 pb-20">
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold">项目</h1>
            <p className="text-xs text-text-secondary mt-1">按项目跟踪报销</p>
          </div>
          <button
            className="rounded-full bg-primary px-4 py-2 text-sm text-white shadow-sm transition hover:shadow-md"
            onClick={() => setShowForm((prev) => !prev)}
            aria-label={showForm ? "关闭新建项目表单" : "打开新建项目表单"}
          >
            新建
          </button>
        </div>
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

        {showForm ? (
          <div className="mt-4 rounded-2xl bg-surface-0 p-4 shadow-sm animate-scale-in">
            <div className="flex flex-col gap-3">
              <div>
                <input
                  className={`h-11 w-full rounded-xl border px-3 text-sm ${
                    nameError ? "border-danger" : "border-border"
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
          {projects.map((project: any, index: number) => (
            <Link
              key={project.projectId}
              href={`/projects/${project.projectId}/expenses`}
              className="block rounded-2xl border border-border bg-surface-0 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md animate-fade-up"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="text-base font-semibold">{project.name}</div>
                  <div className="flex items-center gap-3 text-[11px] text-text-secondary">
                    <span>{formatDate(project.createdAt)}</span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-1 w-1 rounded-full bg-border" />
                      报销单 {project.receiptCount ?? 0}
                    </span>
                  </div>
                  {project.description ? (
                    <div className="text-[11px] text-text-secondary">{project.description}</div>
                  ) : null}
                </div>
                {project.pinned ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    置顶
                  </span>
                ) : null}
              </div>
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
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
