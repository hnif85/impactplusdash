"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Profile {
  id: string;
  customer_guid: string | null;
  full_name: string | null;
  username?: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  [key: string]: unknown;
}

interface Transaction {
  id: string;
  user_id: string | null;
  product_name: string | null;
  created_at: string | null;
  type?: string | null;
  status?: string | null;
  amount?: number | null;
  [key: string]: unknown;
}

interface DailyAgg {
  product_name: string | null;
  date: string;
  total_count: number;
  credit_count: number;
  debit_count: number;
  credit_amount: number;
  debit_amount: number;
  net_amount: number;
}

interface Deliverable {
  id: number;
  type: string;
  title: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  captionPlatform?: string | null;
  captionText?: string | null;
  captionHashtags?: string[] | null;
}

const CW_BASE = "https://createwhiz.ai";
const withBase = (url?: string | null) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${CW_BASE}${url}`;
};

const proxied = (url?: string | null) =>
  url ? `/api/getimage/file?url=${encodeURIComponent(withBase(url))}` : "";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const guid = params?.guid as string | undefined;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dailyAgg, setDailyAgg] = useState<DailyAgg[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!guid) {
        setError("GUID tidak ditemukan di URL.");
        setLoading(false);
        return;
      }
      const token = window.localStorage.getItem("ip_token");
      if (!token) {
        setError("Session expired, please sign in again.");
        router.replace("/login");
        return;
      }
      try {
        const res = await fetch(`/api/profile?guid=${encodeURIComponent(guid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (res.status === 404) {
            // Profile is missing, but continue showing the rest of the page with empty data.
            setProfile(null);
            setTransactions([]);
            setDailyAgg([]);
            setProfileNotice(body?.error ?? "Profile tidak ditemukan. Menampilkan data lain jika ada.");
          } else {
            setError(body?.error ?? "Gagal memuat data.");
            return;
          }
        } else {
          const data = (await res.json()) as { profile: Profile; transactions: Transaction[]; daily: DailyAgg[] };
          setProfile(data.profile);
          setTransactions(data.transactions ?? []);
          setDailyAgg(data.daily ?? []);
          setProfileNotice(null);
        }

        // load deliverables from sample getimage data
        const delivRes = await fetch(`/api/getimage?guid=${encodeURIComponent(guid)}`);
        if (delivRes.ok) {
          const delivData = (await delivRes.json()) as { deliverables?: Deliverable[] };
          const mapped = (delivData.deliverables ?? []).map((d) => ({
            ...d,
            fileUrl: withBase(d.fileUrl),
            thumbnailUrl: d.thumbnailUrl ?? d.fileUrl,
          }));
          setDeliverables(mapped);
        }
      } catch {
        setError("Terjadi kesalahan memuat data.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [guid, router]);

  const valueRow = (label: string, value: string | null | undefined) => (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">{label}</p>
      <p className="text-sm font-medium text-white">{value || "-"}</p>
    </div>
  );

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    if (!selectedDeliverable) return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setSelectedDeliverable(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDeliverable]);

  const renderModal = () => {
    const d = selectedDeliverable;
    if (!d) return null;
    const isVideo = d.type?.toLowerCase().includes("video");

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50">
          <button
            type="button"
            onClick={() => setSelectedDeliverable(null)}
            className="absolute right-4 top-4 rounded-full border border-white/20 px-3 py-1 text-sm font-semibold text-white hover:border-white/70 hover:bg-white/10"
          >
            Tutup
          </button>
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
              {isVideo ? (
                <video
                  src={proxied(d.fileUrl)}
                  controls
                  className="h-full w-full object-contain"
                  poster={d.thumbnailUrl ? proxied(d.thumbnailUrl) : undefined}
                />
              ) : (
                <img src={proxied(d.fileUrl)} alt={d.title} className="h-full w-full object-contain" />
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">{d.captionPlatform ?? "platform"}</p>
                <h3 className="text-lg font-semibold text-white">{d.title}</h3>
              </div>
              <p className="text-sm text-zinc-200 whitespace-pre-line">{d.captionText || "Tidak ada caption."}</p>
              {d.captionHashtags?.length ? (
                <div className="space-y-1 text-sm text-emerald-200">
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">Hashtags</p>
                  <div className="flex flex-wrap gap-2">
                    {d.captionHashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-emerald-200/40 px-3 py-1 text-xs font-medium text-emerald-100 bg-emerald-900/40"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 text-sm">
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-white transition hover:border-white/70 hover:bg-white/10"
                >
                  Buka di tab baru
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedDeliverable(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-500/50 px-3 py-2 text-zinc-100 transition hover:border-zinc-200 hover:bg-zinc-800"
                >
                  Tutup dialog
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-200">User Detail</p>
            <h1 className="text-2xl font-semibold text-white">
              {profile?.full_name || profile?.username || profile?.email || guid}
            </h1>
          </div>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-zinc-200/70 hover:text-zinc-200"
          >
            Kembali
          </button>
        </div>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-300">Memuat data...</div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-zinc-500/50 bg-zinc-900 px-4 py-3 text-zinc-100">{error}</div>
        )}

        {!loading && !error && (
          <div className="space-y-3">
            {profileNotice ? (
              <div className="rounded-2xl border border-amber-500/50 bg-amber-900/30 px-4 py-3 text-amber-100">
                {profileNotice}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {valueRow("Email", profile?.email || null)}
              {valueRow("Username", (profile?.username as string | null) ?? null)}
              {valueRow("Phone", profile?.phone || null)}
              {valueRow("Didaftarkan pada", formatDate(profile?.created_at ?? null))}
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Penggunaan Aplikasi</p>
                <h2 className="text-lg font-semibold text-white">Riwayat Penggunaan</h2>
              </div>
              <div className="text-xs text-zinc-300">{transactions.length} transaksi</div>
            </div>

            {dailyAgg.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-200">
                Belum ada transaksi untuk user ini.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-white/5 text-zinc-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Produk</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Tanggal</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Count</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Debit</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Credit</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 bg-zinc-950/40 text-zinc-50">
                    {dailyAgg.map((row) => (
                      <tr key={`${row.product_name}-${row.date}`} className="hover:bg-white/5">
                        <td className="px-3 py-2 font-medium">{row.product_name ?? "-"}</td>
                        <td className="px-3 py-2 text-zinc-200">
                          {new Date(row.date).toLocaleDateString("id-ID", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2 text-zinc-200">{row.total_count}</td>
                        <td className="px-3 py-2 text-zinc-200">-{row.debit_amount}</td>
                        <td className="px-3 py-2 text-zinc-200">+{row.credit_amount}</td>
                        <td className="px-3 py-2 text-zinc-200">{row.net_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Hasil dari aplikasi</p>
                <h2 className="text-lg font-semibold text-white">List Image</h2>
              </div>
              <div className="text-xs text-zinc-300">{deliverables.length} item</div>
            </div>

            {deliverables.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-200">
                User ini belum menghasilkan output apapun dari aplikasi.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {deliverables.map((d) => (
                  <article
                    key={d.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40 shadow-lg shadow-black/30"
                  >
                    <div className="relative h-48 w-full bg-zinc-900">
                      {d.thumbnailUrl ? (
                        <img
                          src={proxied(d.thumbnailUrl)}
                          alt={d.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-400">No thumbnail</div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
                        {d.type}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <p className="text-sm font-semibold text-white">{d.title}</p>
                      <p className="text-xs text-zinc-400">{d.captionPlatform ?? "-"}</p>
                      <p className="text-sm text-zinc-200 line-clamp-3">{d.captionText ?? ""}</p>
                      <div className="mt-auto space-y-2 text-xs text-zinc-200">
                        <button
                          type="button"
                          onClick={() => setSelectedDeliverable(d)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-400/60 px-3 py-2 text-zinc-100 transition hover:border-zinc-200 hover:bg-zinc-800"
                        >
                          Buka file
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {renderModal()}
    </div>
  );
}
