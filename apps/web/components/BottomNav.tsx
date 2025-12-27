"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/projects", label: "项目" },
  { href: "/inbox", label: "收件箱" },
  { href: "/settings", label: "设置" }
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 pb-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto max-w-md px-4">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-surface-0/90 px-3 py-2 shadow-lg backdrop-blur">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition ${
                  active
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary" : "bg-transparent"}`} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
