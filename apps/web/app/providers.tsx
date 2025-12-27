/**
 * Providers - 全局状态提供者组件
 *
 * 这个文件负责初始化和提供整个应用需要的全局功能：
 * 1. React Query（数据请求和缓存管理）
 * 2. Toast 提示（成功/错误消息）
 * 3. 离线队列（网络断开时的请求缓存）
 * 4. Service Worker（PWA 支持，可以像 App 一样离线使用）
 *
 * "use client" 说明：
 * - 这是 Next.js 的指令，表示这个组件只在浏览器端运行
 * - 因为涉及到 localStorage、navigator 等浏览器 API
 */
"use client";

// React Query: 用于管理服务器数据的请求、缓存和状态
// 类似于后端的数据层，但是在前端
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// React 核心 hooks
import { ReactNode, useEffect, useState } from "react";

// 离线队列：当用户网络断开时，请求会被缓存到本地，等网络恢复后自动重试
import { flushQueue, startQueueListener } from "../lib/offlineQueue";

// Toast 提示组件（类似于手机 App 的弹出提示）
import { ToastProvider } from "../components/Toast";

/**
 * Providers 组件
 *
 * @param children - 子组件（应用的所有页面）
 *
 * 这个组件的作用：
 * - 在应用启动时初始化各种全局功能
 * - 通过 Context（上下文）将这些功能提供给所有子组件使用
 */
export default function Providers({ children }: { children: ReactNode }) {
  /**
   * useState: React 的状态管理 hook
   * 这里创建了一个 QueryClient 实例（React Query 的核心）
   *
   * 为什么用 useState 而不是直接 new QueryClient()？
   * - 因为组件可能会重新渲染，useState 保证 client 只创建一次
   * - () => new QueryClient() 是惰性初始化，只在第一次渲染时执行
   */
  const [client] = useState(() => new QueryClient());

  /**
   * useEffect: React 的副作用 hook
   * 用于执行一些"副作用"操作（不是直接渲染 UI 的操作）
   *
   * 什么是副作用？
   * - 发送网络请求
   * - 订阅事件监听器
   * - 操作浏览器 API（如 localStorage、navigator 等）
   *
   * 空数组 [] 说明：
   * - 这个 effect 只在组件第一次加载时执行一次
   * - 类似于类组件的 componentDidMount
   */
  useEffect(() => {
    // 启动离线队列监听器
    // 当用户从离线变为在线时，自动发送之前缓存的请求
    startQueueListener();

    // 如果当前在线，尝试清空队列中的请求
    if (navigator.onLine) {
      void flushQueue(); // void 表示我们不关心返回值
    }

    // 检查浏览器是否支持 Service Worker
    if ("serviceWorker" in navigator) {
      /**
       * Service Worker 是什么？
       * - 一个运行在后台的脚本，可以拦截网络请求
       * - 实现离线缓存、推送通知等功能
       * - 让 Web 应用可以像原生 App 一样工作
       */

      /**
       * 开发环境：注销所有 Service Worker 并清空缓存
       * 为什么开发时要这样做？
       * - Service Worker 会缓存旧版本的代码和 HTML
       * - 如果不清除，可能看到的是旧代码，导致调试困难
       * - 生产环境不需要这样做，因为用户需要离线缓存功能
       */
      if (process.env.NODE_ENV !== "production") {
        // 获取所有已注册的 Service Worker
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) =>
            // 注销所有 Service Worker
            Promise.all(regs.map((reg) => reg.unregister().catch(() => undefined)))
          )
          .catch(() => undefined);

        // 删除所有缓存
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => undefined);
        return;
      }

      /**
       * 生产环境：注册 Service Worker
       * - /sw.js 是 Service Worker 的脚本文件
       * - 注册后，它会缓存静态资源，实现离线访问
       */
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []); // 空数组表示只在组件挂载时执行一次

  /**
   * 返回组件树
   *
   * 这里使用了"提供者模式"（Provider Pattern）：
   * 1. QueryClientProvider: 提供 React Query 功能
   *    - 所有子组件都可以使用 useQuery、useMutation 等 hook
   *    - 管理所有 API 请求的缓存和状态
   *
   * 2. ToastProvider: 提供 Toast 提示功能
   *    - 所有子组件都可以调用 toast.success()、toast.error() 等方法
   *    - 统一管理所有提示消息的显示
   *
   * 嵌套顺序：
   * QueryClientProvider 在外层，ToastProvider 在内层
   * 这样 Toast 组件也可以使用 React Query 的功能
   */
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

