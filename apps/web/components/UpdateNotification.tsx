"use client";

import { useState, useEffect } from "react";
import { swUpdateManager } from "../lib/swUpdate";

/**
 * 更新提示组件
 *
 * 当检测到新版本时，显示一个优雅的更新提示
 */
export default function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // 初始化更新管理器
    // 每30分钟检查一次更新
    swUpdateManager.init(
      (hasUpdate) => {
        if (hasUpdate) {
          setShowUpdate(true);
        }
      },
      30 * 60 * 1000 // 30分钟
    );

    return () => {
      swUpdateManager.destroy();
    };
  }, []);

  const handleUpdate = () => {
    setIsUpdating(true);
    // 延迟一下，让用户看到更新动画
    setTimeout(() => {
      swUpdateManager.activateUpdate();
    }, 500);
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-slide-down">
      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="rounded-2xl bg-primary text-white shadow-xl shadow-primary/30 overflow-hidden">
          <div className="p-4 flex items-start gap-3">
            {/* 图标 */}
            <div className="shrink-0 mt-0.5">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isUpdating ? "animate-spin" : ""}
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </div>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold mb-1">
                {isUpdating ? "正在更新..." : "发现新版本"}
              </h3>
              <p className="text-xs opacity-90">
                {isUpdating
                  ? "即将刷新页面应用更新"
                  : "检测到新版本，点击更新以获得最佳体验"}
              </p>
            </div>

            {/* 关闭按钮 */}
            {!isUpdating && (
              <button
                onClick={handleDismiss}
                className="shrink-0 p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="关闭"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* 操作按钮 */}
          {!isUpdating && (
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white/20 text-sm font-semibold hover:bg-white/30 transition-colors"
              >
                稍后
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 py-2.5 px-4 rounded-xl bg-white text-primary text-sm font-bold hover:bg-white/90 transition-all active:scale-95"
              >
                立即更新
              </button>
            </div>
          )}

          {/* 更新进度条 */}
          {isUpdating && (
            <div className="h-1 bg-white/20 overflow-hidden">
              <div className="h-full bg-white animate-pulse" style={{ width: "100%" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
