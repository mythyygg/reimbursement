"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  {
    href: "/projects",
    label: "工作台",
    icon: (active: boolean) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={active ? "0" : "2"}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-surface-0/95 backdrop-blur-lg border-t border-border lg:hidden shadow-soft-lg"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto max-w-2xl px-2">
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 ease-out cursor-pointer ${
                  active
                    ? "text-primary"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-surface-2/50"
                }`}
              >
                <div className="transition-transform duration-200 active:scale-90">
                  {tab.icon(active)}
                </div>
                <span
                  className={`text-xs transition-all duration-200 ${
                    active ? "font-semibold" : "font-medium"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
