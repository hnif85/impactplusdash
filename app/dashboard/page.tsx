"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SurveySummary } from "@/lib/cmsCustomers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DashboardRole, DashboardUserProfile } from "@/lib/auth/rbac";
import { roleLabels } from "@/lib/auth/rbac";

const DEFAULT_CAMPAIGN_CODE = "CB6aXl";
const PRODUCT_NAME = "AI untuk UMKM";
const PAGE_SIZE = 10;

type ProductEntry = {
  product_name?: string | null;
  name?: string | null;
  product?: string | null;
  expired_at?: string | null;
};

type CampaignCustomer = {
  guid: string | null;
  email: string | null;
  full_name?: string | null;
  username?: string | null;
  phone: string | null;
  referal_code: string | null;
  subscribe_list: string[];
  product_list: ProductEntry[];
  status: "active" | "expired" | "registered";
  expires_at: string | null;
  activity_status: "active" | "idle" | "pasif";
  last_debit_usage: string | null;
};

type CampaignSummary = {
  registeredUsers: number;
  activeUsers: number;
  expiredUsers: number;
  purchasers: number;
  transactions: number;
};

type CampaignResponse = {
  summary: CampaignSummary;
  customers: CampaignCustomer[];
  companyName?: string | null;
  surveySummary?: SurveySummary | null;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-zinc-500">Loading dashboard…</div>}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const [profile, setProfile] = useState<DashboardUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [customers, setCustomers] = useState<CampaignCustomer[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [surveySummary, setSurveySummary] = useState<SurveySummary | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "active" | "idle" | "pasif">("all");
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const activityFromUrl = searchParams.get("activity");
    if (activityFromUrl === "active" || activityFromUrl === "idle" || activityFromUrl === "pasif") {
      setActivityFilter(activityFromUrl);
    } else {
      setActivityFilter("all");
    }
  }, [searchParams]);

  const updateActivityFilter = (value: typeof activityFilter) => {
    setActivityFilter(value);
    setPage(1);

    const nextParams = new URLSearchParams(Array.from(searchParams.entries()));
    if (value === "all") {
      nextParams.delete("activity");
    } else {
      nextParams.set("activity", value);
    }

    const qs = nextParams.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  useEffect(() => {
    const loadProfile = async () => {
      const token = window.localStorage.getItem("ip_token");
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setError("Session expired, please sign in again.");
        window.localStorage.removeItem("ip_token");
        router.replace("/login");
        return;
      }

      const data = (await res.json()) as DashboardUserProfile;
      const resolvedReferral =
        window.localStorage.getItem("ip_referral_code") ??
        data.referral_code ??
        DEFAULT_CAMPAIGN_CODE;

      if (resolvedReferral) {
        window.localStorage.setItem("ip_referral_code", resolvedReferral);
        setReferralCode(resolvedReferral);
      } else {
        window.localStorage.removeItem("ip_referral_code");
        setReferralCode(null);
      }

      setProfile({
        ...data,
        role: data.role as DashboardRole,
      });
      setLoadingProfile(false);
    };

    loadProfile();
  }, [router]);

  useEffect(() => {
    const loadCampaign = async () => {
      if (!profile || !referralCode) return;

      const token = window.localStorage.getItem("ip_token");
      if (!token) {
        setError("Session expired, please sign in again.");
        router.replace("/login");
        return;
      }

      try {
        setCampaignLoading(true);
        setError(null);

        const qs = new URLSearchParams({
          referralCode,
          productName: PRODUCT_NAME,
        });

        const res = await fetch(`/api/campaign?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Gagal memuat data campaign.");
          return;
        }

        const data = (await res.json()) as CampaignResponse;
        setSummary(data.summary);
        setCustomers(data.customers);
        setCompanyName(data.companyName ?? null);
        setSurveySummary(data.surveySummary ?? null);
        setPage(1);
      } catch {
        setError("Terjadi kesalahan saat memuat dashboard campaign.");
      } finally {
        setCampaignLoading(false);
      }
    };

    loadCampaign();
  }, [profile, referralCode, router]);

  const handleSignOut = async () => {
    window.localStorage.removeItem("ip_token");
    window.localStorage.removeItem("ip_referral_code");
    router.replace("/login");
  };

  const roleBadge = profile ? roleLabels[profile.role] : "Role";

  const statusColors: Record<CampaignCustomer["status"], string> = useMemo(
    () => ({
      active: "bg-zinc-200 text-zinc-900 ring-zinc-300",
      expired: "bg-zinc-800 text-zinc-100 ring-zinc-700",
      registered: "bg-zinc-100 text-zinc-800 ring-zinc-200",
    }),
    []
  );

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesSearch = term
        ? (c.email ?? c.guid ?? "").toLowerCase().includes(term)
        : true;
      const matchesActivity = activityFilter === "all" ? true : c.activity_status === activityFilter;
      return matchesSearch && matchesActivity;
    });
  }, [activityFilter, customers, searchTerm]);

  const customerActivity = useMemo(
    () => {
      const counts = {
        total: customers.length,
        active: 0,
        idle: 0,
        pasif: 0,
      };

      customers.forEach((c) => {
        if (c.activity_status === "active") counts.active += 1;
        else if (c.activity_status === "idle") counts.idle += 1;
        else if (c.activity_status === "pasif") counts.pasif += 1;
      });

      return counts;
    },
    [customers]
  );

  const totalCustomers = filteredCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleExport = async () => {
    if (filteredCustomers.length === 0) {
      setExportError("Tidak ada data yang cocok dengan filter saat ini.");
      return;
    }

    setExportError(null);
    setExporting(true);

    try {
      const XLSX = await import("xlsx");

      const headers = [
        "Email",
        "GUID",
        "Nama",
        "Telepon",
        "Referral Code",
        "Activity",
        "Status",
        "Terakhir Debit",
        "Expired At",
        "Produk",
      ];

      const rows = filteredCustomers.map((customer) => {
        const productsLabel =
          customer.product_list.length > 0
            ? customer.product_list
                .map((p) => {
                  const name = p.product_name ?? p.name ?? p.product ?? "Unknown";
                  const exp = p.expired_at ? formatDate(p.expired_at) : "-";
                  return `${name} (exp ${exp})`;
                })
                .join(", ")
            : customer.subscribe_list.join(", ");

        return [
          customer.email ?? "",
          customer.guid ?? "",
          customer.full_name ?? customer.username ?? "",
          customer.phone ?? "",
          customer.referal_code ?? "",
          customer.activity_status,
          customer.status,
          customer.last_debit_usage ? formatDate(customer.last_debit_usage) : "-",
          customer.expires_at ? formatDate(customer.expires_at) : "-",
          productsLabel || "-",
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

      const dateStamp = new Date().toISOString().slice(0, 10);
      const activityTag = activityFilter === "all" ? "semua" : activityFilter;
      const filename = `users-${activityTag}-${dateStamp}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error("Failed to export excel", err);
      setExportError("Gagal mengekspor data. Silakan coba lagi.");
    } finally {
      setExporting(false);
    }
  };

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

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8">
        {(loadingProfile || campaignLoading) && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-300">
            {loadingProfile ? "Loading your profile..." : "Loading campaign data..."}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-zinc-500/50 bg-zinc-900 px-4 py-3 text-zinc-100">
            {error}
          </div>
        )}

        {profile && !error && (
          <>
            {surveySummary ? (
              <SurveySummarySection snapshot={surveySummary} loading={campaignLoading} />
            ) : (
              <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
                <p className="text-sm text-zinc-300">Ringkasan survey belum tersedia.</p>
              </section>
            )}
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-200">Impact Plus Dashboard</p>
                  <h1 className="text-2xl font-semibold text-white">
                    Dashboard untuk program {companyName ?? "CB6aXl"}
                  </h1>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Jumlah user terdaftar",
                    value: customerActivity.total,
                    hint: "Total user yang terdaftar di program ini",
                  },
                  {
                    label: "User aktif",
                    value: customerActivity.active,
                    hint: "Aktif dengan debit < 7 hari terakhir",
                  },
                  {
                    label: "User idle",
                    value: customerActivity.idle,
                    hint: "Tidak aktif 7 - 30 hari terakhir",
                  },
                  {
                    label: "User pasif",
                    value: customerActivity.pasif,
                    hint: "Tidak aktif lebih dari 30 hari",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10"
                  >
                    <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">{item.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-white">
                      {campaignLoading ? "..." : item.value}
                    </p>
                    <p className="text-xs text-zinc-400">{item.hint}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Daftar user</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExport}
                    disabled={exporting || filteredCustomers.length === 0}
                    className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/80 hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {exporting ? "Mengekspor..." : "Export Excel"}
                  </button>
                  <select
                    value={activityFilter}
                    onChange={(e) => {
                      updateActivityFilter(e.target.value as typeof activityFilter);
                    }}
                    className="rounded-xl border border-white/20 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-200/70 focus:outline-none"
                  >
                    <option value="all">Semua activity</option>
                    <option value="active">Active (&lt; 7 hari)</option>
                    <option value="idle">Idle (7 - 30 hari)</option>
                    <option value="pasif">Pasif (&gt; 30 hari)</option>
                  </select>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Cari email..."
                    className="rounded-xl border border-white/20 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-200/70 focus:outline-none"
                  />
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200">
                    {campaignLoading ? "Menyegarkan..." : `${totalCustomers} baris ditampilkan`}
                  </div>
                </div>
              </div>

              {exportError && (
                <p className="mt-2 text-xs text-amber-300">{exportError}</p>
              )}

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40 text-zinc-50 shadow-inner shadow-black/30">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Nama / Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Aplikasi yang dipergunakan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Activity
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-white/5 text-zinc-50">
                    {campaignLoading && (
                      <tr>
                        <td className="px-4 py-4 text-zinc-200" colSpan={4}>
                          Memuat data campaign...
                        </td>
                      </tr>
                    )}

                    {!campaignLoading && customers.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-zinc-200" colSpan={4}>
                          Belum ada customer untuk kode referral ini.
                        </td>
                      </tr>
                    )}

                    {!campaignLoading &&
                      paginatedCustomers.map((customer, idx) => {
                        const key = customer.guid ?? customer.email ?? customer.phone ?? `row-${idx}`;
                        const contact = customer.email ?? customer.phone ?? "-";
                        const productsLabel =
                          customer.product_list && customer.product_list.length > 0
                            ? customer.product_list
                                .map((p) => {
                                  const name = p.product_name ?? p.name ?? p.product ?? "Unknown";
                                  const exp = p.expired_at ? formatDate(p.expired_at) : "-";
                                  return `${name} (exp ${exp})`;
                                })
                                .join(", ")
                            : customer.subscribe_list.length > 0
                              ? customer.subscribe_list.join(", ")
                              : "-";
                          return (
                            <tr key={key} className="hover:bg-white/10">
                              <td className="px-4 py-4">
                                <div className="font-semibold text-zinc-50">
                                  {customer.email ?? customer.guid ?? "Tanpa GUID"}
                                </div>
                                <div className="text-xs text-zinc-300">
                                  {customer.full_name ?? customer.username ?? customer.guid ?? contact}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-zinc-100 text-sm">{productsLabel}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-col gap-1 text-zinc-100">
                                <span
                                  className={
                                    {
                                      active: "inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-600/20 px-3 py-1 text-emerald-100 ring-1 ring-emerald-500/50",
                                      idle: "inline-flex w-fit items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-1 text-amber-100 ring-1 ring-amber-400/60",
                                      pasif: "inline-flex w-fit items-center gap-2 rounded-lg bg-red-500/20 px-3 py-1 text-red-100 ring-1 ring-red-400/60",
                                    }[customer.activity_status]
                                  }
                                >
                                  <span className="h-2 w-2 rounded-full bg-current" />
                                  {customer.activity_status === "active"
                                    ? "Active ( < 7 hari)"
                                    : customer.activity_status === "idle"
                                      ? "Idle (7 - 30 hari)"
                                      : "Pasif ( > 30 hari)"}
                                </span>
                                <span className="text-xs text-zinc-400">
                                  Terakhir menggunakan: {customer.last_debit_usage ? formatDate(customer.last_debit_usage) : "-"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {customer.guid ? (
                                <a
                                  href={`/dashboard/user/${customer.guid}`}
                                  className="inline-flex items-center rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold transition hover:border-zinc-200/70 hover:text-zinc-50"
                                >
                                  Detail
                                </a>
                              ) : (
                                <span className="text-xs text-zinc-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>

                <div className="flex items-center justify-between border-t border-white/10 bg-black/60 px-4 py-3 text-xs text-zinc-200">
                  <span>
                    Halaman {currentPage} dari {totalPages} - Menampilkan {" "}
                    {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCustomers)}-
                    {Math.min(currentPage * PAGE_SIZE, totalCustomers)} dari {totalCustomers}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-zinc-200/70 hover:text-zinc-50"
                    >
                      Prev
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded-lg border border-white/20 px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-zinc-200/70 hover:text-zinc-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SurveySummarySection({
  snapshot,
  loading,
}: {
  snapshot: SurveySummary;
  loading: boolean;
}) {
  const kpis = [
    { label: "Total responden", value: snapshot.totalRespondents.toLocaleString("id-ID"), hint: "Jumlah survey yang masuk" },
    { label: "Completion rate", value: `${Math.round(snapshot.completionRate * 100)}%`, hint: "Persentase respon yang selesai" },
    { label: "Skor kepuasan", value: `${snapshot.averageScore.toFixed(1)}/5`, hint: "Rata-rata rating kepuasan" },
    { label: "NPS", value: snapshot.nps > 0 ? `+${snapshot.nps}` : `${snapshot.nps}`, hint: "Net Promoter Score" },
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Ringkasan Survey</p>
          <h2 className="text-xl font-semibold text-white">Hasil keseluruhan</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {loading ? "Menyegarkan data..." : "Diperbarui dari hasil survey terbaru"}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-inner shadow-black/10"
          >
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">{item.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{loading ? "..." : item.value}</p>
            <p className="text-xs text-zinc-500">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 lg:col-span-1">
          <p className="mb-2 text-sm font-semibold text-white">Distribusi Kepuasan</p>
          <div className="h-60">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={snapshot.satisfactionBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  label={(entry) => `${entry.name} (${entry.value}%)`}
                >
                  {snapshot.satisfactionBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.1)" }}
                  formatter={(value: number | string | undefined, name: string | undefined) => [`${value ?? 0}%`, name ?? ""]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 lg:col-span-2">
          <p className="mb-2 text-sm font-semibold text-white">Top 5 Pain Point</p>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart
                data={snapshot.painPoints}
                layout="vertical"
                margin={{ top: 8, right: 12, bottom: 8, left: 40 }}
              >
                <XAxis type="number" tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.3)" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.3)" }}
                  width={110}
                />
                <Tooltip
                  contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.1)" }}
                  formatter={(value: number | string | undefined) => [`${value ?? 0}%`, "Porsi keluhan"]}
                />
                <Bar dataKey="value" radius={[6, 6, 6, 6]} fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 lg:col-span-2">
          <p className="mb-2 text-sm font-semibold text-white">Insight Cepat</p>
          <ul className="space-y-2 text-sm text-zinc-200">
            {snapshot.insights.map((text) => (
              <li
                key={text}
                className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 lg:col-span-1">
          <p className="mb-2 text-sm font-semibold text-white">Sampel Kutipan</p>
          <div className="space-y-2 text-sm">
            {snapshot.quotes.slice(0, 5).map((item, idx) => {
              const badgeStyles =
                item.sentiment === "positif"
                  ? "bg-emerald-600/20 text-emerald-100 ring-1 ring-emerald-500/60"
                  : item.sentiment === "netral"
                    ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60"
                    : "bg-red-500/20 text-red-100 ring-1 ring-red-400/60";
              return (
                <div key={`${item.sentiment}-${idx}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <span className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${badgeStyles}`}>
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {item.sentiment}
                  </span>
                  <p className="text-zinc-100">"{item.quote}"</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}


