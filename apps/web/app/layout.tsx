/**
 * RootLayout - Next.js 全局布局组件
 *
 * 这是整个应用的最外层布局，所有页面都会被包裹在这个组件中。
 * 类似于传统 HTML 的 <html> 和 <body> 标签。
 */

// 导入全局样式（TailwindCSS + 自定义样式）
import "./globals.css";

// 导入 Providers 组件（用于注入全局状态管理、主题等）
import Providers from "./providers";

// ReactNode 是 React 的类型定义，表示可以渲染的内容（组件、文本、数字等）
import type { ReactNode } from "react";

/**
 * metadata - 页面元数据
 * Next.js 会自动将这些信息注入到 HTML 的 <head> 标签中
 * 这样可以设置网页标题、描述、图标等
 */
export const metadata = {
  title: "报销助手",
  description: "报销准备工具",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
};

/**
 * viewport - 视口配置
 * 控制网页在移动设备上的显示方式
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

/**
 * RootLayout - 根布局组件
 *
 * @param children - 子组件（当前页面的内容）
 *
 * Next.js 的工作原理：
 * 1. 当用户访问 /projects 时，Next.js 会渲染 projects/page.tsx
 * 2. 然后将 projects/page.tsx 作为 children 传入这个 RootLayout
 * 3. 最终生成完整的 HTML 页面
 *
 * 举例：
 * <RootLayout>
 *   <ProjectsPage />  ← 这是 children
 * </RootLayout>
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // html 标签
    // lang="zh-CN": 设置页面语言为中文
    // suppressHydrationWarning: 抑制 Next.js 的 hydration 警告（服务端渲染和客户端渲染可能有细微差异）
    <html lang="zh-CN" suppressHydrationWarning>
      {/* body 标签 - 使用系统字体 */}
      <body suppressHydrationWarning className="font-sans">
        {/*
          Providers 组件包裹所有内容
          它提供了：
          - 主题切换（深色/浅色模式）
          - 全局状态管理（如用户登录信息）
          - Toast 提示组件等
        */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
