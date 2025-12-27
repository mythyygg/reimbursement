/**
 * 票据收纳箱页面 - ReceiptsPage
 *
 * 功能概述：
 * 1. 显示项目下的所有票据（发票、收据等）
 * 2. 支持上传多张票据图片或 PDF
 * 3. 预览票据详情
 * 4. 编辑票据信息（金额、日期、商户等）
 * 5. 删除票据
 * 6. 离线支持（断网时上传会缓存到本地队列）
 *
 * "use client" 说明：
 * - 这是客户端组件，只在浏览器运行
 * - 因为需要使用 useState、文件上传等浏览器 API
 */
"use client";

// React 核心 hooks
// useState: 管理组件状态（如上传进度、预览状态等）
// useEffect: 处理副作用（如页面加载时获取数据）
import { useState, useEffect } from "react";

// Next.js 路由 hooks
// useParams: 获取 URL 参数（如 /projects/[projectId]/receipts 中的 projectId）
import { useParams } from "next/navigation";

// React Query: 用于数据请求和缓存
// useQuery: 自动管理数据请求、缓存、重试等
import { useQuery } from "@tanstack/react-query";

// API 工具函数
import { apiFetch } from "../../../../lib/api";          // 封装的 fetch 函数，自动添加认证 token
import { enqueueReceipt } from "../../../../lib/offlineQueue";  // 离线队列，断网时缓存上传任务
import { generateClientRequestId } from "../../../../lib/uuid"; // 生成唯一 ID，用于防止重复提交

// UI 组件
import BottomNav from "../../../../components/BottomNav";       // 底部导航栏
import ConfirmDialog from "../../../../components/ConfirmDialog"; // 确认对话框（删除时使用）
import { useToast } from "../../../../components/Toast";        // Toast 提示（成功/失败消息）
import { useErrorHandler } from "../../../../lib/useErrorHandler"; // 统一错误处理

import { ReceiptCard } from "./ReceiptCard"; // 票据卡片组件（显示单张票据的信息）
import type { ReceiptRecord } from "./types"; // TypeScript 类型定义

/**
 * ReceiptsPage 主组件
 *
 * React 组件是一个返回 UI 的函数
 * 每次状态改变时，React 会重新调用这个函数来更新界面
 */
export default function ReceiptsPage() {
  /**
   * 1. 获取路由参数
   * useParams 从 URL 中提取参数
   * 例如：/projects/abc123/receipts → projectId = "abc123"
   */
  const params = useParams();
  const projectId = params.projectId as string;

  /**
   * 2. 定义组件状态
   * useState 是 React 的状态管理 hook
   * 语法：const [state, setState] = useState(initialValue)
   *
   * - state: 当前状态值
   * - setState: 更新状态的函数
   * - initialValue: 初始值
   */

  // 上传状态相关
  const [uploading, setUploading] = useState(false); // 是否正在上传
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 }); // 上传进度

  // 删除确认对话框状态（存储要删除的票据 ID）
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  /**
   * 3. 获取工具函数
   * 这些是自定义 hook，提供特定功能
   */
  const { showSuccess } = useToast();       // 显示成功提示
  const { handleError } = useErrorHandler(); // 统一错误处理

  /**
   * 4. 使用 React Query 获取票据列表
   *
   * useQuery 是一个强大的数据请求 hook，自动处理：
   * - 发送 HTTP 请求
   * - 缓存响应数据
   * - 自动重试失败的请求
   * - 页面切换回来时自动刷新数据
   *
   * 参数说明：
   * - queryKey: 缓存的 key（类似于 Redis 的 key）
   * - queryFn: 实际的请求函数
   */
  const { data, refetch } = useQuery({
    queryKey: ["receipts", projectId], // 缓存 key: ["receipts", "项目ID"]
    queryFn: () => apiFetch(`/projects/${projectId}/receipts`) // 请求函数：GET /api/v1/projects/{projectId}/receipts
  });

  /**
   * 5. 处理返回的数据
   *
   * 为什么要这样处理？
   * - data 可能是 undefined（请求还没完成）
   * - 需要确保 receipts 始终是一个数组
   * - 然后按更新时间排序（最新的在前面）
   */

  const receipts = Array.isArray(data) ? (data as ReceiptRecord[]) : [];
  const sortedReceipts = receipts
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

  // 刷新数据的函数（重新获取票据列表）
  const handleRefetch = async () => {
    await refetch();
  };

  /**
   * 删除票据的函数
   *
   * async/await 说明：
   * - async: 声明这是一个异步函数
   * - await: 等待异步操作完成
   *
   * try/catch/finally:
   * - try: 尝试执行代码
   * - catch: 如果出错，执行错误处理
   * - finally: 无论成功失败都会执行（用于清理状态）
   */
  const handleDelete = async (receiptId: string) => {
    try {
      // 1. 发送删除请求到后端 API
      await apiFetch(`/receipts/${receiptId}`, { method: "DELETE" });

      // 2. 刷新票据列表
      await refetch();

      // 3. 显示成功提示
      showSuccess("票据已删除");
    } catch (error) {
      // 4. 如果出错，显示错误提示
      handleError(error, "删除票据失败");
    } finally {
      // 5. 关闭确认对话框（无论成功失败）
      setDeleteConfirm(null);
    }
  };

  /**
   * 预览相关状态
   * 用于在弹窗中预览票据图片或 PDF
   */
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(null); // 要预览的票据
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);       // 预览图片的 URL
  const [previewLoading, setPreviewLoading] = useState(false);             // 是否正在加载预览
  const [previewError, setPreviewError] = useState<string | null>(null);   // 预览错误信息

  /**
   * 上传票据的核心函数
   *
   * 上传流程（安全的直传对象存储）：
   * 1. 在后端创建票据记录
   * 2. 获取预签名上传 URL（临时的、安全的上传地址）
   * 3. 前端直接上传文件到对象存储（MinIO/S3）
   * 4. 通知后端上传完成
   *
   * 为什么这样做？
   * - 直传：文件不经过后端，减轻服务器压力
   * - 预签名 URL：临时有效的上传地址，安全可控
   * - 离线支持：断网时缓存到本地队列
   */
  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });

        const clientRequestId = generateClientRequestId();
        const ticketName = clientRequestId;

        console.log(`[Upload] Starting upload for file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        const totalStart = Date.now();

        if (!navigator.onLine) {
          console.log("[Upload] Offline detected, enqueueing...");
          await enqueueReceipt({
            projectId,
            file,
            fileExt: file.name.split(".").pop() || "bin",
            contentType: file.type || "application/octet-stream",
            clientRequestId,
            hash: clientRequestId
          });
          continue;
        }

        // Stage 1: Create Receipt Record
        const s1Start = Date.now();
        const receipt = await apiFetch<any>(`/projects/${projectId}/receipts`, {
          method: "POST",
          body: JSON.stringify({ client_request_id: clientRequestId })
        });
        console.log(`[Upload] Stage 1: Create Receipt Record took ${Date.now() - s1Start}ms`);

        // Stage 2: Get Signed URL
        const s2Start = Date.now();
        const upload = await apiFetch<any>(`/receipts/${receipt.receiptId}/upload-url`, {
          method: "POST",
          body: JSON.stringify({
            file_ext: file.name.split(".").pop() || "bin",
            content_type: file.type || "application/octet-stream",
            file_size: file.size
          })
        });
        console.log(`[Upload] Stage 2: Get Signed URL took ${Date.now() - s2Start}ms`);
        console.log(`[Upload] Stage 2: Signed Upload URL: ${upload.signed_url}`);
        console.log(`[Upload] Stage 2: Public URL (fallback): ${upload.public_url}`);

        // Stage 3: Direct S3/R2 Upload
        const s3Start = Date.now();
        console.log(`[Upload] Stage 3: Beginning direct S3 upload to ${new URL(upload.signed_url).hostname}...`);
        try {
          const uploadResponse = await fetch(upload.signed_url, {
            method: "PUT",
            headers: { "content-type": file.type || "application/octet-stream" },
            body: file
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error(`[Upload] Stage 3 Failed: HTTP ${uploadResponse.status} ${uploadResponse.statusText}`, errorText);
            throw new Error(`S3 Upload failed: ${uploadResponse.statusText}`);
          }
        } catch (err: any) {
          if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            console.error("[Upload] Stage 3 Error: Network Error or CORS Blocked. This usually means the preflight request failed or the endpoint is unreachable.");
          } else {
            console.error("[Upload] Stage 3 Unexpected Error:", err);
          }
          throw err;
        }
        const s3Duration = Date.now() - s3Start;
        const speedMbps = (file.size / 1024 / 1024) / (s3Duration / 1000);
        console.log(`[Upload] Stage 3: Direct S3 Upload took ${s3Duration}ms (${speedMbps.toFixed(2)} MB/s)`);

        // Stage 4: Complete & Patch
        const s4Start = Date.now();
        await apiFetch(`/receipts/${receipt.receiptId}/complete`, {
          method: "POST",
          body: JSON.stringify({ hash: clientRequestId })
        });

        if (ticketName) {
          await apiFetch(`/receipts/${receipt.receiptId}`, {
            method: "PATCH",
            body: JSON.stringify({ merchant_keyword: ticketName })
          });
        }
        console.log(`[Upload] Stage 4: Completion & Patch took ${Date.now() - s4Start}ms`);
        console.log(`[Upload] Total upload process for ${file.name} took ${Date.now() - totalStart}ms`);

        setExpandedReceiptId(receipt.receiptId);
      }

      await refetch();
      showSuccess(`成功上传 ${files.length} 张票据`);
    } catch (error) {
      handleError(error, "上传票据失败");
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const openPreview = async (receipt: ReceiptRecord) => {
    setPreviewReceipt(receipt);
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewError(null);
    try {
      const download = await apiFetch<{ signed_url: string }>(
        `/receipts/${receipt.receiptId}/download-url`,
        { method: "POST" }
      );
      setPreviewUrl(download.signed_url);
      console.log(`[Preview] Download URL: ${download.signed_url}`);
    } catch (error) {
      setPreviewError("预览不可用");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewReceipt(null);
    setPreviewUrl(null);
    setPreviewError(null);
  };

  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  return (
    <div className="pb-24 bg-gradient-to-b from-white via-surface-1/60 to-surface-1">
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-text-primary">票据收纳箱</div>
            <div className="text-[11px] text-text-secondary mt-0.5">
              已导入 {receipts.length} 张 · 上传后可在卡片内编辑信息 · 支持 JPG / PNG / PDF
            </div>
          </div>
          <label className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white cursor-pointer shadow-sm transition hover:shadow-md ${uploading ? "bg-primary/40 cursor-not-allowed" : "bg-primary"
            }`}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M4 17h16M12 3v12m0 0l-4-4m4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {uploading ? `上传中 ${uploadProgress.current}/${uploadProgress.total}` : "上传票据"}
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(event) => onUpload(event.target.files)}
              disabled={uploading}
              aria-label="上传票据文件"
            />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        {receipts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-0 p-6 text-sm text-text-secondary">
            暂无票据。
          </div>
        ) : null}
        {sortedReceipts.map((receipt, index) => (
          <ReceiptCard
            key={receipt.receiptId}
            receipt={receipt}
            index={index}
            onUpdated={handleRefetch}
            onPreview={openPreview}
            onDelete={async () => setDeleteConfirm(receipt.receiptId)}
            expanded={expandedReceiptId === receipt.receiptId}
            onToggle={() =>
              setExpandedReceiptId((prev) =>
                prev === receipt.receiptId ? null : receipt.receiptId
              )
            }
          />
        ))}
      </div>

      {previewReceipt ? (
        <ReceiptPreview
          receipt={previewReceipt}
          url={previewUrl}
          loading={previewLoading}
          error={previewError}
          onClose={closePreview}
        />
      ) : null}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="确认删除"
        message="删除后不可恢复，确定删除这张票据吗？"
        danger
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <BottomNav />
    </div>
  );
}

function ReceiptPreview({
  receipt,
  url,
  loading,
  error,
  onClose
}: {
  receipt: ReceiptRecord;
  url: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  // Prevent body scroll when preview is open
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const isPdf = receipt.fileExt?.toLowerCase() === "pdf";
  const pdfUrl =
    isPdf && url
      ? `${url}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=FitH`
      : null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={onClose}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface-0 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">票据预览</div>
          <button className="text-xs text-text-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto bg-surface-1 p-4">
          {loading ? <div className="text-sm text-text-secondary">加载中...</div> : null}
          {error ? <div className="text-sm text-danger">{error}</div> : null}
          {!loading && !error && url ? (
            isPdf ? (
              <iframe
                src={pdfUrl || url}
                className="h-[60vh] w-full rounded-xl bg-black"
                title="票据 PDF"
              />
            ) : (
              <img src={url} alt="票据" className="w-full rounded-xl" />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
