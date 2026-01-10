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

  /**
   * 批量获取所有票据的候选
   * 优化：一次请求获取所有票据的候选，而不是n次请求
   *
   * staleTime 设置：
   * - 设置为 30 秒，在这期间不会重新请求
   * - 减少不必要的网络请求
   */
  const { data: candidatesData } = useQuery({
    queryKey: ["batch-candidates", projectId, receipts.map(r => r.receiptId).sort().join(',')],
    queryFn: async () => {
      if (receipts.length === 0) return {};
      const receiptIds = receipts.map(r => r.receiptId);
      return apiFetch('/receipts/batch-candidates', {
        method: 'POST',
        body: JSON.stringify({ receipt_ids: receiptIds })
      });
    },
    enabled: receipts.length > 0, // 只有当有票据时才请求
    staleTime: 30000, // 30秒内不重复请求
    refetchOnWindowFocus: false, // 窗口聚焦时不自动刷新
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
   * 预览相关状态 - 简化版：不再调用签名 API
   */
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /**
   * 预览功能 - 简化版：直接使用已有的 fileUrl
   */
  const openPreview = async (receipt: ReceiptRecord) => {
    setPreviewReceipt(receipt);
    setPreviewUrl(receipt.fileUrl || null);
  };

  const closePreview = () => {
    setPreviewReceipt(null);
    setPreviewUrl(null);
  };

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
  const onUpload = async (files: FileList | null, receiptName: string, receiptAmount: string) => {
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
        // 多文件时，第一个文件使用用户输入的名称和金额，后续文件使用文件名
        const ticketName = i === 0 ? receiptName : file.name.replace(/\.[^/.]+$/, "");
        const ticketAmount = i === 0 ? receiptAmount : "";

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

        // 更新票据名称和金额
        const patchData: Record<string, string | number> = {};
        if (ticketName) {
          patchData.merchant_keyword = ticketName;
        }
        if (ticketAmount.trim() !== "") {
          const parsedAmount = Number(ticketAmount);
          if (!Number.isNaN(parsedAmount)) {
            patchData.receipt_amount = parsedAmount;
          }
        }
        if (Object.keys(patchData).length > 0) {
          await apiFetch(`/receipts/${receipt.receiptId}`, {
            method: "PATCH",
            body: JSON.stringify(patchData)
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

  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  // 上传弹窗状态
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  return (
    <div className="pb-24 lg:pb-10 bg-gradient-to-b from-surface-0 via-surface-1/40 to-surface-1">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-border bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-4 lg:items-center">
          <div className="flex-1">
            <div className="text-base font-bold text-text-primary">票据收纳箱</div>
            <div className="text-xs text-text-secondary mt-1">
              已导入 <span className="font-bold text-primary">{receipts.length}</span> 张 · 支持 JPG / PNG / PDF 格式
            </div>
          </div>
          <button
            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white shadow-md transition-all ${
              uploading ? "bg-primary/40 cursor-not-allowed" : "bg-primary hover:bg-primary-hover hover:shadow-lg shadow-primary/25 hover:shadow-primary/30 active:scale-95"
            }`}
            onClick={() => setUploadModalOpen(true)}
            disabled={uploading}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            {uploading ? `上传中 ${uploadProgress.current}/${uploadProgress.total}` : "上传票据"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {receipts.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border bg-surface-0 p-8 text-center shadow-sm lg:col-span-2">
            <div className="text-sm text-text-secondary font-medium">暂无票据</div>
            <div className="text-xs text-text-tertiary mt-1">点击上方按钮上传票据</div>
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
            candidates={(candidatesData as any)?.[receipt.receiptId] || []}
          />
        ))}
      </div>

      {previewReceipt ? (
        <ReceiptPreview
          receipt={previewReceipt}
          url={previewUrl}
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

      <UploadReceiptModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={(files, name, amount) => {
          setUploadModalOpen(false);
          onUpload(files, name, amount);
        }}
      />

      <BottomNav />
    </div>
  );
}

/**
 * 预览 Modal - 简化版：去掉签名 API 调用，直接显示 fileUrl
 */
function ReceiptPreview({
  receipt,
  url,
  onClose
}: {
  receipt: ReceiptRecord;
  url: string | null;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-3xl bg-surface-0 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-white">
          <div className="text-lg font-bold text-text-primary">票据预览</div>
          <button
            className="rounded-full p-2 hover:bg-surface-2 transition-colors"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto bg-surface-2 p-6">
          {url ? (
            isPdf ? (
              <iframe
                src={pdfUrl || url}
                className="h-[65vh] w-full rounded-2xl bg-black shadow-lg"
                title="票据 PDF"
              />
            ) : (
              <img src={url} alt="票据" className="w-full rounded-2xl shadow-lg" />
            )
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-text-secondary font-medium">暂无预览</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 上传票据弹窗
 *
 * 用于输入票据名称、金额和选择上传文件
 */
function UploadReceiptModal({
  open,
  onClose,
  onUpload
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (files: FileList, name: string, amount: string) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  // 重置表单
  const resetForm = () => {
    setName("");
    setAmount("");
    setFiles(null);
  };

  // 关闭时重置
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // 提交上传
  const handleSubmit = () => {
    if (!files || files.length === 0) {
      return;
    }
    const receiptName = name.trim() || files[0].name.replace(/\.[^/.]+$/, "");
    onUpload(files, receiptName, amount.trim());
    resetForm();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 animate-fade-in sm:items-center sm:p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-dialog-title"
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-surface-0 p-5 shadow-2xl animate-fade-up sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="upload-dialog-title" className="text-base font-semibold text-text-primary mb-4">
          上传票据
        </h2>

        {/* 票据名称输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            票据名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入票据名称（可选）"
            className="w-full h-11 px-4 rounded-xl border border-border bg-white text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* 金额输入 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            金额
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-text-secondary">¥</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="输入金额（可选）"
              className="w-full h-11 pl-8 pr-4 rounded-xl border border-border bg-white text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* 文件选择区域 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            选择文件
          </label>
          <label className="flex flex-col items-center justify-center h-32 rounded-xl border-2 border-dashed border-border bg-surface-1 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
            {files && files.length > 0 ? (
              <div className="text-center px-4">
                <div className="text-sm font-medium text-text-primary">
                  已选择 {files.length} 个文件
                </div>
                <div className="text-xs text-text-secondary mt-1 truncate max-w-full">
                  {Array.from(files).map(f => f.name).join(", ")}
                </div>
              </div>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-8 w-8 text-text-tertiary mb-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <div className="text-sm text-text-secondary">点击选择文件</div>
                <div className="text-xs text-text-tertiary mt-1">支持 JPG / PNG / PDF</div>
              </>
            )}
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>
        </div>

        {/* 按钮组 */}
        <div className="flex gap-3">
          <button
            className="h-11 flex-1 rounded-xl bg-surface-1 text-sm font-medium text-text-primary hover:bg-surface-2 transition-colors"
            onClick={handleClose}
          >
            取消
          </button>
          <button
            className={`h-11 flex-1 rounded-xl text-sm font-medium text-white transition-colors ${
              files && files.length > 0
                ? "bg-primary hover:bg-primary-hover"
                : "bg-primary/40 cursor-not-allowed"
            }`}
            onClick={handleSubmit}
            disabled={!files || files.length === 0}
          >
            确认上传
          </button>
        </div>
      </div>
    </div>
  );
}
