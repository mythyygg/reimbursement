"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api";
import { enqueueReceipt } from "../../../../lib/offlineQueue";
import { generateClientRequestId } from "../../../../lib/uuid";
import BottomNav from "../../../../components/BottomNav";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { useToast } from "../../../../components/Toast";
import { useErrorHandler } from "../../../../lib/useErrorHandler";
import { ReceiptCard } from "./ReceiptCard";
import type { ReceiptRecord } from "./types";

export default function ReceiptsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { showSuccess } = useToast();
  const { handleError } = useErrorHandler();

  const { data, refetch } = useQuery({
    queryKey: ["receipts", projectId],
    queryFn: () => apiFetch(`/projects/${projectId}/receipts`)
  });

  const receipts = Array.isArray(data) ? (data as ReceiptRecord[]) : [];
  const sortedReceipts = receipts
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

  const handleRefetch = async () => {
    await refetch();
  };

  const handleDelete = async (receiptId: string) => {
    try {
      await apiFetch(`/receipts/${receiptId}`, { method: "DELETE" });
      await refetch();
      showSuccess("票据已删除");
    } catch (error) {
      handleError(error, "删除票据失败");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

        if (!navigator.onLine) {
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

        const receipt = await apiFetch<any>(`/projects/${projectId}/receipts`, {
          method: "POST",
          body: JSON.stringify({ client_request_id: clientRequestId })
        });

        const upload = await apiFetch<any>(`/receipts/${receipt.receiptId}/upload-url`, {
          method: "POST",
          body: JSON.stringify({
            file_ext: file.name.split(".").pop() || "bin",
            content_type: file.type || "application/octet-stream",
            file_size: file.size
          })
        });

        await fetch(upload.signed_url, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file
        });

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
          <label className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white cursor-pointer shadow-sm transition hover:shadow-md ${
            uploading ? "bg-primary/40 cursor-not-allowed" : "bg-primary"
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
            onDelete={() => setDeleteConfirm(receipt.receiptId)}
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
