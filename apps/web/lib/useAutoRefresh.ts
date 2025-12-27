/**
 * 定时刷新Hook
 *
 * 用于定期刷新页面数据或页面本身
 */

import { useEffect, useRef } from "react";

export interface UseAutoRefreshOptions {
  /**
   * 刷新间隔（毫秒）
   * 默认: 5分钟
   */
  interval?: number;

  /**
   * 是否启用
   * 默认: true
   */
  enabled?: boolean;

  /**
   * 刷新回调函数
   * 如果提供，则调用此函数而不是刷新页面
   */
  onRefresh?: () => void | Promise<void>;

  /**
   * 页面不可见时是否继续刷新
   * 默认: false
   */
  refreshWhenHidden?: boolean;
}

/**
 * 定时刷新Hook
 *
 * @example
 * // 自动刷新数据
 * useAutoRefresh({
 *   interval: 60000, // 每分钟
 *   onRefresh: async () => {
 *     await refetchData();
 *   }
 * });
 *
 * @example
 * // 自动刷新页面
 * useAutoRefresh({
 *   interval: 300000, // 每5分钟
 * });
 */
export function useAutoRefresh(options: UseAutoRefreshOptions = {}) {
  const {
    interval = 5 * 60 * 1000, // 默认5分钟
    enabled = true,
    onRefresh,
    refreshWhenHidden = false,
  } = options;

  const timerRef = useRef<number | null>(null);
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const doRefresh = async () => {
      // 检查页面是否可见
      if (!refreshWhenHidden && document.visibilityState === "hidden") {
        console.log("[AutoRefresh] 页面不可见，跳过刷新");
        return;
      }

      const now = Date.now();
      const elapsed = now - lastRefreshRef.current;

      // 确保不会过于频繁地刷新
      if (elapsed < interval - 1000) {
        console.log("[AutoRefresh] 距离上次刷新时间过短，跳过");
        return;
      }

      console.log("[AutoRefresh] 执行刷新");
      lastRefreshRef.current = now;

      if (onRefresh) {
        // 调用自定义刷新函数
        try {
          await onRefresh();
        } catch (error) {
          console.error("[AutoRefresh] 刷新失败:", error);
        }
      } else {
        // 刷新页面
        window.location.reload();
      }
    };

    // 设置定时器
    timerRef.current = window.setInterval(doRefresh, interval);

    console.log(`[AutoRefresh] 启动定时刷新，间隔: ${interval / 1000}秒`);

    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        const elapsed = now - lastRefreshRef.current;

        // 如果页面重新可见且距离上次刷新超过间隔，立即刷新
        if (elapsed >= interval) {
          console.log("[AutoRefresh] 页面重新可见且需要刷新");
          doRefresh();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 清理函数
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      console.log("[AutoRefresh] 已停止定时刷新");
    };
  }, [enabled, interval, onRefresh, refreshWhenHidden]);
}

/**
 * 获取上次刷新时间
 */
export function getLastRefreshTime(): Date {
  const timestamp = parseInt(
    localStorage.getItem("lastRefreshTime") || String(Date.now()),
    10
  );
  return new Date(timestamp);
}

/**
 * 设置上次刷新时间
 */
export function setLastRefreshTime(time: Date = new Date()): void {
  localStorage.setItem("lastRefreshTime", String(time.getTime()));
}
