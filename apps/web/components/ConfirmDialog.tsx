"use client";

import { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
  danger = false
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 animate-fade-in sm:items-center sm:p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="w-full rounded-t-3xl bg-surface-0 p-5 shadow-2xl animate-fade-up sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 id="dialog-title" className="text-base font-semibold text-text-primary">
            {title}
          </h2>
          <div className="mt-2 text-sm text-text-secondary">
            {message}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            className="h-11 flex-1 rounded-xl bg-surface-1 text-sm font-medium text-text-primary"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className={`h-11 flex-1 rounded-xl text-sm font-medium text-white ${
              danger ? "bg-danger" : "bg-primary"
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
