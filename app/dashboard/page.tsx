"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DashboardRole, DashboardUserProfile } from "@/lib/auth/rbac";

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
  survey_completed: boolean;
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

  const [customers, setCustomers] = useState<CampaignCustomer[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "aktif" | "pasif" | "never">("all");
  const [surveyFilter, setSurveyFilter] = useState<"all" | "filled" | "empty">("all");
  const [page, setPage] = useState(1);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const activityFromUrl = searchParams.get("activity");
    if (activityFromUrl === "aktif" || activityFromUrl === "pasif" || activityFromUrl === "never") {
      setActivityFilter(activityFromUrl);
    } else {
      setActivityFilter("all");
    }

    const surveyFromUrl = searchParams.get("survey");
    if (surveyFromUrl === "filled" || surveyFromUrl === "empty") {
      setSurveyFilter(surveyFromUrl);
    } else {
      setSurveyFilter("all");
    }
  }, [searchParams]);

  const updateFiltersInUrl = (nextActivity: typeof activityFilter, nextSurvey: typeof surveyFilter) => {
    const nextParams = new URLSearchParams(Array.from(searchParams.entries()));
    if (nextActivity === "all") {
      nextParams.delete("activity");
    } else {
      nextParams.set("activity", nextActivity);
    }

    if (nextSurvey === "all") {
      nextParams.delete("survey");
    } else {
      nextParams.set("survey", nextSurvey);
    }

    const qs = nextParams.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const updateActivityFilter = (value: typeof activityFilter) => {
    setActivityFilter(value);
    setPage(1);
    updateFiltersInUrl(value, surveyFilter);
  };

  const updateSurveyFilter = (value: typeof surveyFilter) => {
    setSurveyFilter(value);
    setPage(1);
    updateFiltersInUrl(activityFilter, value);
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
        setCustomers(data.customers);
        setCompanyName(data.companyName ?? null);
        setPage(1);
      } catch {
        setError("Terjadi kesalahan saat memuat dashboard campaign.");
      } finally {
        setCampaignLoading(false);
      }
    };

    loadCampaign();
  }, [profile, referralCode, router]);

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

  const formatRelativeDate = (value: string | null) => {
    if (!value) return "Belum pernah";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;

    const now = new Date();
    const diffMs = now.getTime() - dt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    const isSameDay =
      dt.getDate() === now.getDate() &&
      dt.getMonth() === now.getMonth() &&
      dt.getFullYear() === now.getFullYear();
    if (isSameDay) {
      const time = dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      return `Hari ini ${time}`;
    }
    if (diffDays < 2) return "Kemarin";
    if (diffDays < 7) return `${Math.floor(diffDays)} hari lalu`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} minggu lalu`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} bulan lalu`;
    return `${Math.floor(diffDays / 365)} tahun lalu`;
  };

  const cleanProductName = (name: string) =>
    name.replace(/\s+(free trial|basic|premium|pro|enterprise)$/i, "").trim();

  const cleanProductNames = (customer: CampaignCustomer) => {
    const seen = new Set<string>();
    const result: string[] = [];
    const entries: ProductEntry[] =
      customer.product_list.length > 0
        ? customer.product_list
        : customer.subscribe_list.map((s) => ({ product_name: s }));
    for (const entry of entries) {
      const raw = entry.product_name ?? entry.name ?? entry.product ?? "";
      const cleaned = cleanProductName(raw);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
    }
    return result;
  };

  const getActivityInfo = (customer: CampaignCustomer) => {
    if (!customer.last_debit_usage) {
      return {
        label: "Belum pernah",
        class: "bg-zinc-700/50 text-zinc-100 ring-white/10",
      };
    }
    const byStatus = {
      active: {
        label: "Active (< 7 hari)",
        class: "bg-emerald-600/20 text-emerald-100 ring-emerald-500/50",
      },
      idle: {
        label: "7 - 30 hari",
        class: "bg-amber-500/20 text-amber-100 ring-amber-400/60",
      },
      pasif: {
        label: "Pasif (> 30 hari)",
        class: "bg-red-500/20 text-red-100 ring-red-400/60",
      },
    };
    return byStatus[customer.activity_status];
  };

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return customers.filter((c) => {
      const matchesSearch = term
        ? (c.email ?? c.guid ?? "").toLowerCase().includes(term)
        : true;
      const matchesActivity =
        activityFilter === "all"
          ? true
          : activityFilter === "aktif"
            ? c.activity_status === "active" || c.activity_status === "idle"
            : activityFilter === "pasif"
              ? c.activity_status === "pasif" && c.last_debit_usage !== null
              : c.last_debit_usage === null;
      const matchesSurvey =
        surveyFilter === "all"
          ? true
          : surveyFilter === "filled"
            ? c.survey_completed
            : !c.survey_completed;
      return matchesSearch && matchesActivity && matchesSurvey;
    });
  }, [activityFilter, customers, searchTerm, surveyFilter]);

  const usageStats = useMemo(() => {
    const stats = {
      total: customers.length,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      pasif: 0,
      neverUsed: 0,
    };
    const now = new Date();

    customers.forEach((c) => {
      if (!c.last_debit_usage) {
        stats.neverUsed += 1;
        return;
      }
      const dt = new Date(c.last_debit_usage);
      if (Number.isNaN(dt.getTime())) {
        stats.neverUsed += 1;
        return;
      }
      const diffDays = (now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
      const isSameDay =
        dt.getDate() === now.getDate() &&
        dt.getMonth() === now.getMonth() &&
        dt.getFullYear() === now.getFullYear();

      if (isSameDay) {
        stats.today += 1;
      } else if (diffDays < 7) {
        stats.thisWeek += 1;
      } else if (diffDays <= 30) {
        stats.thisMonth += 1;
      } else {
        stats.pasif += 1;
      }
    });

    return stats;
  }, [customers]);

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
        "Status Kuesioner",
        "Status",
        "Terakhir Debit",
        "Expired At",
        "Produk",
      ];

      const rows = filteredCustomers.map((customer) => {
        const activityInfo = getActivityInfo(customer);
        const cleanProducts = cleanProductNames(customer);

        return [
          customer.email ?? "",
          customer.guid ?? "",
          customer.full_name ?? customer.username ?? "",
          customer.phone ?? "",
          customer.referal_code ?? "",
          activityInfo.label,
          customer.survey_completed ? "Sudah isi" : "Belum isi",
          customer.status,
          customer.last_debit_usage
            ? `${formatRelativeDate(customer.last_debit_usage)} (${formatDate(customer.last_debit_usage)})`
            : "-",
          customer.expires_at ? formatDate(customer.expires_at) : "-",
          cleanProducts.join(", ") || "-",
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

      const dateStamp = new Date().toISOString().slice(0, 10);
      const activityTag = activityFilter === "all" ? "semua" : activityFilter;
      const surveyTag =
        surveyFilter === "all"
          ? "kuis-semua"
          : surveyFilter === "filled"
            ? "sudah-isi"
            : "belum-isi";
      const filename = `users-${activityTag}-${surveyTag}-${dateStamp}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error("Failed to export excel", err);
      setExportError("Gagal mengekspor data. Silakan coba lagi.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
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
          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 md:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-200">Impact Plus Dashboard</p>
                <h1 className="text-2xl font-semibold text-white">
                  Dashboard untuk program {companyName}
                </h1>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10">
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Total user</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {campaignLoading ? "..." : usageStats.total}
                </p>
                <p className="text-xs text-zinc-400">User yang terdaftar di program ini</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10">
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Aktif</p>
                <div className="mt-2 flex items-baseline gap-3">
                  <p className="text-3xl font-semibold text-white">
                    {campaignLoading
                      ? "..."
                      : usageStats.today + usageStats.thisWeek + usageStats.thisMonth}
                  </p>
                  <p className="text-xs text-zinc-400">user</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300">
                  <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-emerald-100">
                    Hari ini {campaignLoading ? "..." : usageStats.today}
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-100/80">
                    Minggu ini {campaignLoading ? "..." : usageStats.thisWeek}
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-100/80">
                    Bulan ini {campaignLoading ? "..." : usageStats.thisMonth}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/10">
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Pasif</p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {campaignLoading ? "..." : usageStats.pasif}
                </p>
                <p className="text-xs text-zinc-400">User tidak aktif lebih dari 30 hari</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-xl shadow-black/20 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Daftar user</p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3 w-full md:w-auto">
                <button
                  onClick={handleExport}
                  disabled={exporting || filteredCustomers.length === 0}
                  className="w-full rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/80 hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
                >
                  {exporting ? "Mengekspor..." : "Export Excel"}
                </button>
                <select
                  value={activityFilter}
                  onChange={(e) => {
                    updateActivityFilter(e.target.value as typeof activityFilter);
                  }}
                  className="w-full rounded-xl border border-white/20 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-200/70 focus:outline-none md:w-auto"
                >
                  <option value="all">Semua activity</option>
                  <option value="aktif">Aktif</option>
                  <option value="pasif">Pasif</option>
                  <option value="never">Belum pernah debit</option>
                </select>
                <select
                  value={surveyFilter}
                  onChange={(e) => {
                    updateSurveyFilter(e.target.value as typeof surveyFilter);
                  }}
                  className="w-full rounded-xl border border-white/20 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-200/70 focus:outline-none md:w-auto"
                >
                  <option value="all">Semua kuesioner</option>
                  <option value="filled">Sudah isi</option>
                  <option value="empty">Belum isi</option>
                </select>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari email..."
                  className="w-full rounded-xl border border-white/20 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-200/70 focus:outline-none md:w-56"
                />
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 md:w-auto">
                  {campaignLoading ? "Menyegarkan..." : `${totalCustomers} baris ditampilkan`}
                </div>
              </div>
            </div>

            {exportError && (
              <p className="mt-2 text-xs text-amber-300">{exportError}</p>
            )}

            <div className="mt-4 space-y-3">
              {/* Mobile cards */}
              {!campaignLoading && customers.length > 0 && (
                <div className="grid gap-3 md:hidden">
                  {paginatedCustomers.map((customer, idx) => {
                    const key = customer.guid ?? customer.email ?? customer.phone ?? `card-${idx}`;
                    const contact = customer.email ?? customer.phone ?? "-";
                    const activityInfo = getActivityInfo(customer);
                    const cleanProducts = cleanProductNames(customer);

                    return (
                      <article
                        key={key}
                        className="rounded-2xl border border-white/10 bg-zinc-950/80 p-4 shadow-inner shadow-black/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-white leading-tight">
                              {customer.email ?? customer.guid ?? "Tanpa GUID"}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {customer.full_name ?? customer.username ?? customer.guid ?? contact}
                            </p>
                            {customer.phone ? (
                              <p className="text-xs text-zinc-400">Telepon: {customer.phone}</p>
                            ) : null}
                          </div>
                          {customer.guid ? (
                            <a
                              href={`/dashboard/user/${customer.guid}`}
                              className="rounded-lg border border-white/20 px-3 py-1 text-[11px] font-semibold text-white transition hover:border-zinc-200/70 hover:text-zinc-50"
                            >
                              Detail
                            </a>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-2 text-sm text-zinc-200">
                          <div className="rounded-xl border border-white/5 bg-white/10 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Terakhir Menggunakan</p>
                            <p className="font-semibold text-zinc-100">
                              {customer.last_debit_usage ? formatRelativeDate(customer.last_debit_usage) : "Belum pernah"}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {customer.last_debit_usage ? formatDate(customer.last_debit_usage) : "-"}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/5 bg-white/10 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Activity</p>
                              <span className={`mt-1 inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1 text-xs font-semibold ${activityInfo.class}`}>
                                <span className="h-2 w-2 rounded-full bg-current" />
                                {activityInfo.label}
                              </span>
                            </div>
                            <div className="rounded-xl border border-white/5 bg-white/10 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Kuesioner</p>
                              <span
                                className={
                                  customer.survey_completed
                                    ? "mt-1 inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-500/50"
                                    : "mt-1 inline-flex w-fit items-center gap-2 rounded-lg bg-zinc-700/50 px-3 py-1 text-xs font-semibold text-zinc-100 ring-1 ring-white/10"
                                }
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${customer.survey_completed ? "bg-emerald-400" : "bg-zinc-400"}`}
                                />
                                {customer.survey_completed ? "Sudah isi" : "Belum isi"}
                              </span>
                            </div>
                          </div>
                          <div className="rounded-xl border border-white/5 bg-white/10 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Aplikasi</p>
                            <p className="text-xs text-zinc-100">{cleanProducts.join(", ") || "-"}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {/* Desktop table */}
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40 text-zinc-50 shadow-inner shadow-black/30 md:block hidden">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Nama / Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Telepon
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Terakhir Menggunakan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Activity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Kuesioner
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Aplikasi
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-white/5 text-zinc-50">
                    {campaignLoading && (
                      <tr>
                        <td className="px-4 py-4 text-zinc-200" colSpan={7}>
                          Memuat data campaign...
                        </td>
                      </tr>
                    )}
                    {!campaignLoading && customers.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-zinc-200" colSpan={7}>
                          Belum ada customer untuk kode referral ini.
                        </td>
                      </tr>
                    )}
                    {!campaignLoading &&
                      paginatedCustomers.map((customer, idx) => {
                        const key = customer.guid ?? customer.email ?? customer.phone ?? `row-${idx}`;
                        const contact = customer.email ?? customer.phone ?? "-";
                        const phoneLabel = customer.phone ?? "-";
                        const activityInfo = getActivityInfo(customer);
                        const cleanProducts = cleanProductNames(customer);
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
                            <td className="px-4 py-3 text-sm text-zinc-100">{phoneLabel}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-zinc-100">
                                  {customer.last_debit_usage ? formatRelativeDate(customer.last_debit_usage) : "Belum pernah"}
                                </span>
                                <span className="text-xs text-zinc-400">
                                  {customer.last_debit_usage ? formatDate(customer.last_debit_usage) : "-"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1 text-xs font-semibold ${activityInfo.class}`}>
                                <span className="h-2 w-2 rounded-full bg-current" />
                                {activityInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={
                                  customer.survey_completed
                                    ? "inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-600/20 px-3 py-1 text-emerald-100 ring-1 ring-emerald-500/50"
                                    : "inline-flex w-fit items-center gap-2 rounded-lg bg-zinc-700/50 px-3 py-1 text-zinc-100 ring-1 ring-white/10"
                                }
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${customer.survey_completed ? "bg-emerald-400" : "bg-zinc-400"}`}
                                />
                                {customer.survey_completed ? "Sudah isi" : "Belum isi"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-100">
                              {cleanProducts.join(", ") || "-"}
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
                    Halaman {currentPage} dari {totalPages} - Menampilkan{" "}
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

              {!campaignLoading && customers.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-200 md:hidden">
                  Belum ada customer untuk kode referral ini.
                </div>
              )}

              {campaignLoading && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-200 md:hidden">
                  Memuat data campaign...
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
