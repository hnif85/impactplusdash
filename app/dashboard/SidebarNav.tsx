"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/surveys", label: "Hasil Survey" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="h-full rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20">
      <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Menu</p>
      <div className="space-y-2">
        {navItems.map((item) => {
          // Match exact path to avoid highlighting parent routes together
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-emerald-500/20 text-emerald-50 ring-1 ring-emerald-400/60"
                  : "text-zinc-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              {active && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
