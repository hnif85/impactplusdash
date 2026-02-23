"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SurveySummary } from "@/lib/cmsCustomers";
import { useRouter } from "next/navigation";

const DEFAULT_CAMPAIGN_CODE = "CB6aXl";
const PRODUCT_NAME = "AI untuk UMKM";
const IMPORTANT_THRESHOLD = 25; // persen responden -> dianggap penting

type ImportanceBuckets = {
  critical: { name: string; value: number }[];
  monitor: { name: string; value: number }[];
};

const palette = {
  bg: "#0a0a0a",
  surface: "#111111",
  surface2: "#181818",
  border: "#242424",
  text: "#e8e8e8",
  muted: "#8b8b8b",
  dim: "#444",
  accent: "#00d084",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#eab308",
};

function renderMarkdown(md: string): string {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const formatInline = (text: string) => {
    let result = escapeHtml(text);
    result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return result;
  };

  const lines = md.split(/\r?\n/);
  let html = "";
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        html += '<ul style="margin:0.25rem 0 0.4rem 1rem; padding-left:1rem; list-style: disc;">';
        inList = true;
      }
      html += `<li style="margin-bottom:0.25rem;">${formatInline(line.slice(2))}</li>`;
    } else {
      closeList();
      html += `<p style="margin:0.25rem 0 0.35rem;">${formatInline(line)}</p>`;
    }
  }

  closeList();
  return html;
}

export default function SurveyInsightsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-400">Memuat hasil survey...</div>}>
      <SurveyInsightsContent />
    </Suspense>
  );
}

function SurveyInsightsContent() {
  const router = useRouter();
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const token = window.localStorage.getItem("ip_token");
      if (!token) {
        router.replace("/login");
        return;
      }

      const referral = window.localStorage.getItem("ip_referral_code") ?? DEFAULT_CAMPAIGN_CODE;

      try {
        setLoading(true);
        const qs = new URLSearchParams({
          referralCode: referral,
          productName: PRODUCT_NAME,
        });

        const res = await fetch(`/api/campaign?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Gagal memuat hasil survey.");
          return;
        }

        const data = (await res.json()) as { surveySummary?: SurveySummary | null };
        setSummary(data.surveySummary ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kesalahan tak terduga.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const buckets: ImportanceBuckets = useMemo(() => {
    if (!summary) return { critical: [], monitor: [] };
    const sorted = [...summary.painPoints].sort((a, b) => b.value - a.value);
    return {
      critical: sorted.filter((p) => p.value >= IMPORTANT_THRESHOLD),
      monitor: sorted.filter((p) => p.value < IMPORTANT_THRESHOLD),
    };
  }, [summary]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-400">
        Memuat visualisasi hasil survey...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-400">
        Ringkasan survey belum tersedia.
      </div>
    );
  }

  const sortedPainPoints = [...summary.painPoints].sort((a, b) => b.value - a.value);
  const donutStops = summary.satisfactionBreakdown
    .reduce<{ color: string; end: number }[]>((acc, cur) => {
      const last = acc[acc.length - 1]?.end ?? 0;
      acc.push({ color: cur.color, end: last + cur.value });
      return acc;
    }, [])
    .map((stop, idx) => {
      const start = idx === 0 ? 0 : summary.satisfactionBreakdown.slice(0, idx).reduce((sum, item) => sum + item.value, 0);
      return `${stop.color} ${start}% ${stop.end}%`;
    })
    .join(", ");

  const puasPct = summary.satisfactionBreakdown.find((s) => s.name.toLowerCase().includes("puas"))?.value ?? 0;

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: palette.bg, color: palette.text, fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-8xl px-4 py-8">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: palette.accent }}>
              Insights Survey
            </p>
            
          </div>
          <div
            className="flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ background: palette.surface2, border: `1px solid ${palette.border}`, color: palette.muted }}
          >
            {summary.totalRespondents.toLocaleString("id-ID")} responden •
            <span style={{ color: palette.accent }}> NPS {summary.nps >= 0 ? `+${summary.nps}` : summary.nps}</span>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <SurfaceCard>
                <SectionHeading label="Pain Point" title="Urutan Kepentingan" />
                <p className="mb-3 text-[12px] italic" style={{ color: palette.dim }}>
                  Threshold penting: {"\u2265"} {IMPORTANT_THRESHOLD}% responden
                </p>
                <div className="space-y-3">
                  {sortedPainPoints.map((point) => {
                    const pct = Math.min(point.value, 100);
                    const isCritical = point.value >= IMPORTANT_THRESHOLD;
                    const gradient = isCritical
                      ? "linear-gradient(90deg,#ef4444,#dc2626)"
                      : "linear-gradient(90deg,#22c55e,#16a34a)";
                    return (
                      <div key={point.name} className="flex items-center gap-3">
                        <div className="w-28 text-right text-[12.5px]" style={{ color: palette.muted }}>
                          {point.name}
                        </div>
                        <div
                          className="h-5 flex-1 overflow-hidden rounded"
                          style={{ background: palette.surface2, border: `1px solid ${palette.border}` }}
                        >
                          <div className="h-full" style={{ width: `${pct}%`, backgroundImage: gradient }} />
                        </div>
                        <div className="w-10 text-right text-[11.5px]" style={{ color: palette.muted }}>
                          {point.value}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between pl-28 text-[10px] font-mono" style={{ color: palette.dim }}>
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                  </div>
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <SectionHeading label="Kepuasan" title="Distribusi Rating" />
                <div className="flex flex-col items-center gap-4 py-2">
                  <div
                    className="relative h-36 w-36 rounded-full"
                    style={{ background: `conic-gradient(${donutStops})` }}
                  >
                    <div
                      className="absolute inset-6 rounded-full"
                      style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
                      <span className="text-[13px] font-semibold text-white">Puas</span>
                      <span className="text-[12px] font-semibold" style={{ color: palette.green }}>
                        {puasPct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-[11.5px]">
                    {summary.satisfactionBreakdown.map((item) => (
                      <div key={item.name} className="flex items-center gap-2" style={{ color: palette.muted }}>
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: item.color, boxShadow: `0 0 0 4px ${palette.surface2}` }}
                        />
                        {item.name} ({item.value}%)
                      </div>
                    ))}
                  </div>
                </div>
              </SurfaceCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <PriorityCard title="Prioritas Utama" tag="Penting" tone="red">
                {buckets.critical.length === 0 ? (
                  <EmptyState text="Belum ada isu yang menembus ambang penting." />
                ) : (
                  buckets.critical.map((item) => (
                    <PriorityRow key={item.name} name={item.name} value={item.value} tone="red" />
                  ))
                )}
              </PriorityCard>

              <PriorityCard title="Pantau / Nice-to-have" tag="Pendukung" tone="green">
                {buckets.monitor.length === 0 ? (
                  <EmptyState text="Semua isu tergolong penting saat ini." />
                ) : (
                  buckets.monitor.map((item) => (
                    <PriorityRow key={item.name} name={item.name} value={item.value} tone="green" />
                  ))
                )}
              </PriorityCard>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SurfaceCard>
                <SectionHeading label="Ringkasan" title="Insight Cepat" />
                <div className="mt-2 space-y-2">
                  {summary.insights.map((insight) => (
                    <div
                      key={insight}
                      className="flex items-center gap-3 rounded-lg px-3 py-2"
                      style={{ background: palette.surface2, color: palette.muted }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: palette.accent }} />
                      <span className="text-[12.5px]">{insight}</span>
                    </div>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <SectionHeading label="Verbatim" title="Sampel Kutipan" />
                <div className="mt-2 space-y-2">
                  {summary.quotes.slice(0, 5).map((item, idx) => (
                    <QuoteItem key={`${item.sentiment}-${idx}`} sentiment={item.sentiment} quote={item.quote} />
                  ))}
                </div>
              </SurfaceCard>
            </div>
          </div>

          <div
            className="h-full rounded-3xl p-5 lg:sticky lg:top-4"
            style={{ background: palette.surface, border: `1px solid ${palette.border}` }}
          >
            <div className="flex flex-col gap-3">
              <SectionHeading label="Laporan AI" title="Ringkasan otomatis" />
              <p className="text-[12.5px]" style={{ color: palette.muted }}>
                Hasil generasi model berdasarkan data survey terbaru.
              </p>
              <button
                onClick={async () => {
                  try {
                    setReportLoading(true);
                    setReportError(null);
                    setReport(null);
                    const res = await fetch("/api/survey-baseline-report", { method: "POST" });
                    if (!res.ok) {
                      const body = await res.json().catch(() => null);
                      throw new Error(body?.error ?? "Gagal membuat laporan.");
                    }
                    const data = (await res.json()) as { summary?: string };
                    setReport(data.summary ?? "(Tidak ada ringkasan)");
                  } catch (err) {
                    setReportError(err instanceof Error ? err.message : "Terjadi kesalahan.");
                  } finally {
                    setReportLoading(false);
                  }
                }}
                disabled={reportLoading}
                className="w-full rounded-lg px-4 py-3 text-[13px] font-semibold text-black shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #00d084, #00a86b)" }}
              >
                {reportLoading ? "Memproses..." : "⚡ Generate Laporan AI"}
              </button>
              <div
                className="min-h-[220px] rounded-lg p-4 text-[12.5px]"
                style={{ background: palette.surface2, border: `1px solid ${palette.border}`, color: palette.muted, lineHeight: 1.6 }}
              >
                {reportLoading && <span>Model sedang memproses…</span>}
                {!reportLoading && reportError && <span className="text-red-300">{reportError}</span>}
                {!reportLoading && !reportError && report && (
                  <div
                    className="text-white"
                    style={{ display: "grid", gap: "0.25rem" }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }}
                  />
                )}
                {!reportLoading && !reportError && !report && <span>Belum ada output. Klik tombol di atas.</span>}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SurfaceCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: palette.surface, border: `1px solid ${palette.border}` }}>
      {children}
    </div>
  );
}

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.dim }}>
        {label}
      </p>
      <h3 className="text-[15px] font-semibold text-white">{title}</h3>
    </div>
  );
}

function PriorityCard({ title, tag, tone, children }: { title: string; tag: string; tone: "red" | "green"; children: ReactNode }) {
  const tagColor = tone === "red" ? palette.red : palette.green;
  const tagBg = tone === "red" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)";
  return (
    <SurfaceCard>
      <div className="mb-4 flex items-center justify-between">
        <SectionHeading label="Kategori" title={title} />
        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]"
          style={{ background: tagBg, color: tagColor }}
        >
          {tag}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </SurfaceCard>
  );
}

function PriorityRow({ name, value, tone }: { name: string; value: number; tone: "red" | "green" }) {
  const fill = tone === "red" ? palette.red : palette.green;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12.5px]">
        <span className="font-semibold text-white">{name}</span>
        <span style={{ color: palette.muted }} className="font-mono">
          {value}% responden
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: palette.surface2 }}>
        <div className="h-full" style={{ width: `${Math.min(value, 100)}%`, background: fill }} />
      </div>
    </div>
  );
}

function QuoteItem({ sentiment, quote }: { sentiment: string; quote: string }) {
  const tone =
    sentiment === "positif"
      ? { bg: "rgba(34,197,94,0.12)", color: palette.green }
      : sentiment === "netral"
        ? { bg: "rgba(234,179,8,0.15)", color: palette.yellow }
        : { bg: "rgba(239,68,68,0.15)", color: palette.red };

  return (
    <div className="rounded-lg p-3" style={{ background: palette.surface2, border: `1px solid ${palette.border}` }}>
      <span
        className="mb-2 inline-block rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]"
        style={{ background: tone.bg, color: tone.color }}
      >
        {sentiment}
      </span>
      <p className="text-[12.5px]" style={{ color: palette.muted }}>
        "{quote}"
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12.5px]"
      style={{ background: palette.surface2, border: `1px dashed ${palette.border}`, color: palette.muted }}
    >
      {text}
    </div>
  );
}
