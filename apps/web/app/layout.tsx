import "./globals.css";
import Providers from "./providers";
import type { ReactNode } from "react";

export const metadata = {
  title: "报销助手",
  description: "报销准备工具",
  manifest: "/manifest.json"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
