"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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

  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [customers, setCustomers] = useState<CampaignCustomer[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | "active" | "idle" | "pasif">("all");
  const [surveyFilter, setSurveyFilter] = useState<"all" | "filled" | "empty">("all");
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
        setSummary(data.summary);
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
      const matchesSurvey =
        surveyFilter === "all"
          ? true
          : surveyFilter === "filled"
            ? c.survey_completed
            : !c.survey_completed;
      return matchesSearch && matchesActivity && matchesSurvey;
    });
  }, [activityFilter, customers, searchTerm, surveyFilter]);

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
        "Status Kuesioner",
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
          customer.survey_completed ? "Sudah isi" : "Belum isi",
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
                  <option value="active">Active (&lt; 7 hari)</option>
                  <option value="idle">Idle (7 - 30 hari)</option>
                  <option value="pasif">Pasif (&gt; 30 hari)</option>
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
                    const activityClass = {
                      active: "bg-emerald-600/15 text-emerald-100 ring-1 ring-emerald-500/50",
                      idle: "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/60",
                      pasif: "bg-red-500/15 text-red-100 ring-1 ring-red-400/60",
                    }[customer.activity_status];

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
                            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Aplikasi</p>
                            <p className="text-zinc-100">{productsLabel}</p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/5 bg-white/10 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Activity</p>
                              <span className={`mt-1 inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1 text-xs font-semibold ${activityClass}`}>
                                <span className="h-2 w-2 rounded-full bg-current" />
                                {customer.activity_status === "active"
                                  ? "Active ( < 7 hari)"
                                  : customer.activity_status === "idle"
                                    ? "Idle (7 - 30 hari)"
                                    : "Pasif ( > 30 hari)"}
                              </span>
                              <p className="mt-1 text-[11px] text-zinc-500">
                                Terakhir menggunakan:{" "}
                                {customer.last_debit_usage ? formatDate(customer.last_debit_usage) : "-"}
                              </p>
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
                        Aplikasi yang dipergunakan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Activity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Kuesioner
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-white/5 text-zinc-50">
                    {campaignLoading && (
                      <tr>
                        <td className="px-4 py-4 text-zinc-200" colSpan={5}>
                          Memuat data campaign...
                        </td>
                      </tr>
                    )}
                    {!campaignLoading && customers.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-zinc-200" colSpan={5}>
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
