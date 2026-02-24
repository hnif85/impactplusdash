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

interface SurveyAnswer {
  question_id: string;
  question_text: string;
  order_index: number;
  answer_text: string | null;
  answer_value: string | number | null;
  selected_options: string[];
}

type AnswerLike = Pick<SurveyAnswer, "selected_options" | "answer_text" | "answer_value"> &
  Partial<SurveyAnswer>;

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
  const [surveyAnswers, setSurveyAnswers] = useState<SurveyAnswer[]>([]);
  const [answersModalOpen, setAnswersModalOpen] = useState(false);
  const [resumeText, setResumeText] = useState<string>("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeNeedsRetry, setResumeNeedsRetry] = useState(false);
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
            setProfile(null);
            setTransactions([]);
            setDailyAgg([]);
            setSurveyAnswers(body?.surveyAnswers ?? []);
            setProfileNotice(body?.error ?? "Profile tidak ditemukan. Menampilkan data lain jika ada.");
          } else {
            setError(body?.error ?? "Gagal memuat data.");
            return;
          }
        } else {
          const data = (await res.json()) as {
            profile: Profile;
            transactions: Transaction[];
            daily: DailyAgg[];
            surveyAnswers?: SurveyAnswer[] | null;
          };
          setProfile(data.profile);
          setTransactions(data.transactions ?? []);
          setDailyAgg(data.daily ?? []);
          setSurveyAnswers(data.surveyAnswers ?? []);
          setProfileNotice(null);
        }

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
      <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{label}</p>
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

  const renderAnswerValue = (answer: AnswerLike) => {
    if (answer.selected_options?.length) return answer.selected_options.join(", ");
    if (answer.answer_text) return answer.answer_text;
    if (answer.answer_value !== null && answer.answer_value !== undefined) return String(answer.answer_value);
    return "-";
  };

  const formatAmount = (value: number | null | undefined, prefix = "") => {
    if (value === null || value === undefined) return "-";
    return `${prefix}${Math.abs(value).toLocaleString("id-ID")}`;
  };

  const surveyPhone = surveyAnswers.find((ans) =>
    (ans.question_text || "").toLowerCase().includes("whatsapp")
  );
  const phoneDisplay =
    profile?.phone ||
    renderAnswerValue(surveyPhone ?? { selected_options: [], answer_text: null, answer_value: null }) ||
    "-";

  const pickAnswer = (...keywords: string[]) => {
    const lower = keywords.map((k) => k.toLowerCase());
    const found = surveyAnswers.find((ans) => {
      const text = (ans.question_text || "").toLowerCase();
      return lower.some((k) => text.includes(k));
    });
    return found ? renderAnswerValue(found) : "-";
  };

  const basicSurveyData = [
    { label: "Brand", value: pickAnswer("brand kamu apa", "brand kamu") },
    { label: "Jenis usaha", value: pickAnswer("jenis usaha") },
    { label: "Kisaran omzet per bulan", value: pickAnswer("omzet", "kisar", "omset") },
    { label: "Jumlah karyawan aktif", value: pickAnswer("jumlah karyawan") },
    { label: "Lama usaha berjalan", value: pickAnswer("lama usaha") },
    { label: "Platform promosi", value: pickAnswer("platform promosi") },
    { label: "Metode pencatatan", value: pickAnswer("cara pencatatan") },
  ];

  const answersNoTimestamp = surveyAnswers.filter(
    (ans) => !/timestamp/i.test(ans.question_text ?? "")
  );

  // Generate AI resume when answers change
  useEffect(() => {
    const run = async () => {
      if (answersNoTimestamp.length === 0) {
        setResumeText("");
        return;
      }
      setResumeLoading(true);
      setResumeError(null);
      setResumeNeedsRetry(false);
      try {
        const res = await fetch("/api/survey-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guid,
            answers: answersNoTimestamp,
            profile: {
              name: profile?.full_name ?? profile?.username ?? profile?.email ?? guid,
              email: profile?.email,
              phone: phoneDisplay,
            },
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Gagal membuat resume.");
        }
        const data = (await res.json()) as { resume: string };
        setResumeText(data.resume);
      } catch (err) {
        setResumeError(err instanceof Error ? err.message : "Gagal membuat resume.");
        setResumeNeedsRetry(true);
      } finally {
        setResumeLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answersNoTimestamp.map((a) => `${a.question_id}:${a.answer_text}:${a.answer_value}:${a.selected_options?.join("|")}` ).join("|")]);

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
                      <span key={tag} className="rounded-full border border-emerald-200/40 px-3 py-1 text-xs font-medium text-emerald-100 bg-emerald-900/40">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 text-sm">
                <a href={d.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-3 py-2 text-white transition hover:border-white/70 hover:bg-white/10">
                  Buka di tab baru
                </a>
                <button type="button" onClick={() => setSelectedDeliverable(null)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-500/50 px-3 py-2 text-zinc-100 transition hover:border-zinc-200 hover:bg-zinc-800">
                  Tutup dialog
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAnswersModal = () => {
    if (!answersModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
        <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Kuesioner Baseline</p>
              <h3 className="text-lg font-semibold text-white">Jawaban Lengkap</h3>
            </div>
            <button
              type="button"
              onClick={() => setAnswersModalOpen(false)}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-white/60 hover:bg-white/10"
            >
              Tutup
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
            {answersNoTimestamp.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-300">
                Tidak ada jawaban kuesioner.
              </div>
            ) : (
              answersNoTimestamp.map((ans, idx) => (
                <div
                  key={ans.question_id}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 shadow-inner shadow-black/20"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-full bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center text-[11px] font-bold text-emerald-200">
                      {idx + 1}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">{ans.question_text}</p>
                      <p className="text-sm text-white whitespace-pre-line">
                        {ans.selected_options?.length
                          ? ans.selected_options.join(", ")
                          : ans.answer_text || (ans.answer_value !== null && ans.answer_value !== undefined
                            ? String(ans.answer_value)
                            : "Tidak ada jawaban")}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-50">
      <div className="mx-auto max-w-8xl px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">User Detail</p>
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
          <div className="space-y-6">

            {profileNotice && (
              <div className="rounded-2xl border border-amber-500/50 bg-amber-900/30 px-4 py-3 text-amber-100">
                {profileNotice}
              </div>
            )}

            {/* Data Dasar dari profil + ringkasan survey */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
              <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">Data Dasar</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {valueRow("Email", profile?.email || null)}
                {valueRow("Username", (profile?.username as string | null) ?? null)}
                {valueRow("Phone / Whatsapp", phoneDisplay)}
                {valueRow("Didaftarkan pada", formatDate(profile?.created_at ?? null))}
                {basicSurveyData.map((item) => (
                  <div key={item.label} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.15em] text-zinc-300">{item.label}</p>
                    <p className="text-sm font-medium text-white">{item.value || "-"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content: 2 col on large */}
            <div className="grid gap-6 lg:grid-cols-3">

              {/* Left: Transactions + Deliverables */}
              <div className="lg:col-span-2 space-y-6">

                {/* Riwayat Penggunaan */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Penggunaan Aplikasi</p>
                      <h2 className="text-lg font-semibold text-white">Riwayat Penggunaan</h2>
                    </div>
                    <span className="rounded-full bg-zinc-800 border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      {transactions.length} transaksi
                    </span>
                  </div>

                  {dailyAgg.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-400 text-sm">
                      Belum ada transaksi untuk user ini.
                    </div>
                  ) : (
                    <>
                      {/* Mobile: card list */}
                      <div className="grid gap-3 md:hidden">
                        {dailyAgg.map((row) => (
                          <article
                            key={`${row.product_name}-${row.date}`}
                            className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/90 via-zinc-900/60 to-black p-4 shadow-lg shadow-black/30"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Produk</p>
                                <p className="text-base font-semibold text-white leading-tight">{row.product_name ?? "-"}</p>
                              </div>
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-zinc-200">
                                {row.total_count}x
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                              <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Tanggal</p>
                                <p className="text-zinc-100">
                                  {new Date(row.date).toLocaleDateString("id-ID", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </p>
                              </div>
                              <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Debit</p>
                                <p className="text-rose-300 font-semibold">{formatAmount(row.debit_amount, "-")}</p>
                              </div>
                              <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Credit</p>
                                <p className="text-emerald-300 font-semibold">{formatAmount(row.credit_amount, "+")}</p>
                              </div>
                              <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Net</p>
                                <p className="font-semibold text-white">{formatAmount(row.net_amount)}</p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                      {/* Desktop: table */}
                      <div className="hidden overflow-hidden rounded-xl border border-white/10 md:block">
                        <table className="min-w-full divide-y divide-white/10 text-sm">
                          <thead className="bg-white/5 text-zinc-400">
                            <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Produk</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Tanggal</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Count</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Debit</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Credit</th>
                              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">Net</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10 bg-zinc-950/40 text-zinc-50">
                            {dailyAgg.map((row) => (
                              <tr key={`${row.product_name}-${row.date}`} className="hover:bg-white/5 transition-colors">
                                <td className="px-3 py-2.5 font-medium">{row.product_name ?? "-"}</td>
                                <td className="px-3 py-2.5 text-zinc-300">
                                  {new Date(row.date).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" })}
                                </td>
                                <td className="px-3 py-2.5 text-zinc-300">{row.total_count}</td>
                                <td className="px-3 py-2.5 text-rose-400">{formatAmount(row.debit_amount, "-")}</td>
                                <td className="px-3 py-2.5 text-emerald-400">{formatAmount(row.credit_amount, "+")}</td>
                                <td className="px-3 py-2.5 font-semibold text-white">{formatAmount(row.net_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* List Image */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Hasil dari aplikasi</p>
                      <h2 className="text-lg font-semibold text-white">List Image</h2>
                    </div>
                    <span className="rounded-full bg-zinc-800 border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      {deliverables.length} item
                    </span>
                  </div>

                  {deliverables.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-400 text-sm">
                      User ini belum menghasilkan output apapun dari aplikasi.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {deliverables.map((d) => (
                        <article key={d.id} className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40 shadow-lg shadow-black/30">
                          <div className="relative h-48 w-full bg-zinc-900">
                            {d.thumbnailUrl ? (
                              <img src={proxied(d.thumbnailUrl)} alt={d.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-zinc-600 text-sm">No thumbnail</div>
                            )}
                            <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-200">
                              {d.type}
                            </span>
                          </div>
                          <div className="flex flex-1 flex-col gap-2 p-4">
                            <p className="text-sm font-semibold text-white">{d.title}</p>
                            <p className="text-xs text-zinc-500">{d.captionPlatform ?? "-"}</p>
                            <p className="text-sm text-zinc-300 line-clamp-3">{d.captionText ?? ""}</p>
                            <div className="mt-auto pt-2">
                              <button type="button" onClick={() => setSelectedDeliverable(d)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-400/60 px-3 py-2 text-xs text-zinc-100 transition hover:border-zinc-200 hover:bg-zinc-800">
                                Buka file
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Resume + modal trigger */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-inner shadow-black/20 lg:sticky lg:top-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Kuesioner Baseline</p>
                      <h2 className="text-lg font-semibold text-white">Resume Customer (AI)</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-900/60 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300">
                        {answersNoTimestamp.length} data
                      </span>
                      <button
                        type="button"
                        onClick={() => setAnswersModalOpen(true)}
                        className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/70 hover:bg-white/10"
                      >
                        Jawaban lengkap
                      </button>
                    </div>
                  </div>

                  {answersNoTimestamp.length === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-400 text-sm">
                      Belum ada data kuesioner untuk diringkas.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 shadow-inner shadow-black/20">
                        {resumeLoading ? (
                          <p className="text-sm text-zinc-300">Menyusun resume dengan AI…</p>
                        ) : resumeError ? (
                          resumeNeedsRetry && (
                            <button
                              type="button"
                              onClick={() => {
                                setResumeError(null);
                                setResumeNeedsRetry(false);
                                setResumeText("");
                                setResumeLoading(true);
                                fetch("/api/survey-resume", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    guid,
                                    answers: answersNoTimestamp,
                                    profile: {
                                      name: profile?.full_name ?? profile?.username ?? profile?.email ?? guid,
                                      email: profile?.email,
                                      phone: phoneDisplay,
                                    },
                                  }),
                                })
                                  .then(async (res) => {
                                    if (!res.ok) {
                                      const body = await res.json().catch(() => null);
                                      throw new Error(body?.error ?? "Gagal membuat resume.");
                                    }
                                    const data = (await res.json()) as { resume: string };
                                    setResumeText(data.resume);
                                  })
                                  .catch((err) => {
                                    setResumeError(err instanceof Error ? err.message : "Gagal membuat resume.");
                                    setResumeNeedsRetry(true);
                                  })
                                  .finally(() => setResumeLoading(false));
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-amber-300/60 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-200 hover:bg-amber-500/10"
                            >
                              Regenerate
                            </button>
                          )
                        ) : (
                          <p className="text-sm text-white leading-relaxed whitespace-pre-line">
                            {resumeText || "Resume belum tersedia."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
      {renderModal()}
      {renderAnswersModal()}
    </div>
  );
}
