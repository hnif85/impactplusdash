'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardUserProfile, DashboardRole } from "@/lib/auth/rbac";
import { roleLabels } from "@/lib/auth/rbac";

interface AuthState {
  loading: boolean;
  error: string | null;
}

const fields = [
  { name: "email", label: "Email", type: "email", placeholder: "admin@company.com" },
  { name: "password", label: "Password", type: "password", placeholder: "********" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [authState, setAuthState] = useState<AuthState>({ loading: false, error: null });
  const [profile, setProfile] = useState<DashboardUserProfile | null>(null);

  const formValid = useMemo(() => form.email.trim() !== "" && form.password.length >= 6, [form]);

  useEffect(() => {
    // If token already in localStorage, go to dashboard.
    const token = window.localStorage.getItem("ip_token");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formValid) return;

    setAuthState({ loading: true, error: null });

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Login failed");
      }

      const { token, user } = json as { token: string; user: DashboardUserProfile };
      window.localStorage.setItem("ip_token", token);
      if (user.referral_code) {
        window.localStorage.setItem("ip_referral_code", user.referral_code);
      } else {
        window.localStorage.removeItem("ip_referral_code");
      }
      setProfile(user);
      router.push("/dashboard");
    } catch (err) {
      setAuthState({ loading: false, error: (err as Error).message });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-200 md:hidden">
          Impact Plus
        </p>
        <h1 className="text-3xl font-semibold text-zinc-50">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-200/80">
          Enter your admin credentials to access the dashboard.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
        {fields.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <label htmlFor={field.name} className="text-sm text-zinc-100">
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type={field.type}
              required
              value={form[field.name]}
              onChange={handleInput}
              placeholder={field.placeholder}
              className="h-11 rounded-xl border border-white/10 bg-white/10 px-3 text-zinc-50 placeholder:text-zinc-300/60 outline-none ring-2 ring-transparent transition focus:border-zinc-200/70 focus:ring-zinc-200/40"
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={!formValid || authState.loading}
          className="mt-2 h-11 rounded-xl bg-zinc-100 font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {authState.loading ? "Signing in..." : "Sign in"}
        </button>

        {authState.error && (
          <div className="rounded-xl border border-zinc-500/50 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            {authState.error}
          </div>
        )}

        {profile && (
          <div className="rounded-xl border border-zinc-400/50 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            Role detected: <span className="font-semibold">{roleLabels[profile.role]}</span>
            {profile.company_id ? ` - Company ID ${profile.company_id}` : " - No company assigned"}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200/80">
        Need an account? Ask a Super Admin to invite you via the Supabase auth
        dashboard and insert your profile into <code className="font-mono">dashboard_users</code>.
      </div>
    </div>
  );
}
