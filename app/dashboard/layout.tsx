"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DashboardRole, DashboardUserProfile } from "@/lib/auth/rbac";
import { roleLabels } from "@/lib/auth/rbac";
import { SidebarNav } from "./SidebarNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<DashboardUserProfile | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const token = window.localStorage.getItem("ip_token");
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        router.replace("/login");
        return;
      }
      const data = (await res.json()) as DashboardUserProfile;
      setProfile({ ...data, role: data.role as DashboardRole });
    };

    loadProfile();
  }, [router]);

  const handleSignOut = async () => {
    window.localStorage.removeItem("ip_token");
    window.localStorage.removeItem("ip_referral_code");
    router.replace("/login");
  };

  const roleBadge = profile ? roleLabels[profile.role] : "Role";

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-50">
      <header className="flex items-center justify-between border-b border-white/10 bg-black/70 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-lg font-semibold text-zinc-900 shadow-lg shadow-zinc-500/30">
            IP
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Impact Plus Dashboard</p>
            <p className="text-base font-semibold text-white">{roleBadge}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <div className="text-right text-sm">
              <p className="font-semibold text-white">{profile.full_name ?? profile.email}</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-zinc-200/70 hover:text-zinc-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto w-full px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <SidebarNav />
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
