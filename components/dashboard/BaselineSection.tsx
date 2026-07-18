"use client";

import { useMemo } from "react";

export interface SurveyAnswer {
  question_id: string;
  question_text: string;
  order_index: number;
  answer_text: string | null;
  answer_value: string | number | null;
  selected_options: string[];
}

type CategoryDef = {
  title: string;
  accent: string;
  fields: FieldDef[];
};

type FieldDef = {
  label: string;
  order: number;
  textFallback: string[];
  kind: "text" | "rating" | "checkbox";
  reverse?: boolean;
  max?: number;
  suffix?: string;
};

const CATEGORIES: CategoryDef[] = [
  {
    title: "Profil Usaha",
    accent: "emerald",
    fields: [
      { label: "Brand", order: 3, textFallback: ["brand kamu"], kind: "text" },
      { label: "Jenis usaha", order: 5, textFallback: ["jenis usaha"], kind: "text" },
      { label: "Lama usaha berjalan", order: 6, textFallback: ["lama usaha"], kind: "text" },
      { label: "Jumlah karyawan aktif", order: 7, textFallback: ["jumlah karyawan"], kind: "text" },
      { label: "Kisaran omzet per bulan", order: 8, textFallback: ["omzet", "kisar", "omset"], kind: "text" },
      { label: "Cara pencatatan keuangan", order: 9, textFallback: ["cara pencatatan", "pencatatan keuangan"], kind: "text" },
    ],
  },
  {
    title: "Skor & Tren",
    accent: "sky",
    fields: [
      { label: "Skor keteraturan proses bisnis", order: 10, textFallback: ["keteraturan proses"], kind: "rating", max: 5, suffix: "/5" },
      { label: "Tren omzet 6 bulan terakhir", order: 11, textFallback: ["tren omzet"], kind: "text" },
      { label: "Skor kondisi bisnis saat ini", order: 12, textFallback: ["kondisi bisnis"], kind: "rating", max: 5, suffix: "/5" },
    ],
  },
  {
    title: "Konten & Promosi",
    accent: "violet",
    fields: [
      { label: "Platform promosi yang digunakan", order: 13, textFallback: ["platform promosi"], kind: "checkbox" },
      { label: "Dampak media sosial terhadap penjualan", order: 14, textFallback: ["dampak media sosial"], kind: "text" },
      { label: "Cara membuat konten saat ini", order: 15, textFallback: ["cara membuat konten"], kind: "text" },
      { label: "Frekuensi membuat konten", order: 16, textFallback: ["frekuensi membuat konten"], kind: "text" },
      { label: "Skor kesulitan membuat konten", order: 17, textFallback: ["seberapa sulit", "sulit dalam membuat konten"], kind: "rating", reverse: true, max: 5, suffix: "/5" },
      { label: "Sosial media usaha (akun)", order: 18, textFallback: ["sosial media usaha", "semua akun"], kind: "text" },
    ],
  },
  {
    title: "AI Readiness",
    accent: "amber",
    fields: [
      { label: "Pengenalan AI", order: 19, textFallback: ["pengenalan ai"], kind: "text" },
      { label: "Persepsi terhadap AI", order: 20, textFallback: ["persepsi terhadap ai"], kind: "text" },
      { label: "Frekuensi penggunaan AI", order: 21, textFallback: ["frekuensi penggunaan ai"], kind: "text" },
      { label: "Kesediaan menggunakan AI", order: 22, textFallback: ["kesediaan menggunakan ai"], kind: "text" },
      { label: "Kisaran biaya wajar per bulan untuk AI", order: 23, textFallback: ["biaya wajar"], kind: "text" },
    ],
  },
  {
    title: "Tantangan & Kesiapan",
    accent: "rose",
    fields: [
      { label: "Tantangan utama usaha", order: 24, textFallback: ["tantangan utama"], kind: "checkbox" },
      { label: "Skor kesiapan mengubah cara kerja", order: 25, textFallback: ["kesiapan mengubah"], kind: "rating", max: 5, suffix: "/5" },
    ],
  },
];

const ACCENT_CLASSES: Record<string, { ring: string; chipText: string; chipBg: string; chipBorder: string }> = {
  emerald: { ring: "border-emerald-500/30", chipText: "text-emerald-200", chipBg: "bg-emerald-900/40", chipBorder: "border-emerald-500/40" },
  sky:     { ring: "border-sky-500/30",     chipText: "text-sky-200",     chipBg: "bg-sky-900/40",     chipBorder: "border-sky-500/40" },
  violet:  { ring: "border-violet-500/30",  chipText: "text-violet-200",  chipBg: "bg-violet-900/40",  chipBorder: "border-violet-500/40" },
  amber:   { ring: "border-amber-500/30",    chipText: "text-amber-200",   chipBg: "bg-amber-900/40",   chipBorder: "border-amber-500/40" },
  rose:    { ring: "border-rose-500/30",     chipText: "text-rose-200",    chipBg: "bg-rose-900/40",    chipBorder: "border-rose-500/40" },
};

function pickByOrder(answers: SurveyAnswer[], order: number): SurveyAnswer | undefined {
  return answers.find((a) => a.order_index === order);
}

function pickByText(answers: SurveyAnswer[], keywords: string[]): SurveyAnswer | undefined {
  const lower = keywords.map((k) => k.toLowerCase());
  return answers.find((a) => {
    const t = (a.question_text || "").toLowerCase();
    return lower.some((k) => t.includes(k));
  });
}

function resolveAnswer(answers: SurveyAnswer[], field: FieldDef): SurveyAnswer | undefined {
  return pickByOrder(answers, field.order) ?? pickByText(answers, field.textFallback);
}

function renderTextValue(ans: SurveyAnswer | undefined): string {
  if (!ans) return "-";
  if (ans.selected_options?.length) return ans.selected_options.join(", ");
  if (ans.answer_text) return ans.answer_text;
  if (ans.answer_value !== null && ans.answer_value !== undefined) return String(ans.answer_value);
  return "-";
}

function parseRating(ans: SurveyAnswer | undefined): number | null {
  if (!ans) return null;
  const v = ans.answer_value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (ans.answer_text) {
    const n = Number(ans.answer_text);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function ratingLabel(score: number, max: number, reverse?: boolean): string {
  if (reverse) {
    if (score <= 1) return "Sangat mudah";
    if (score === 2) return "Mudah";
    if (score === 3) return "Sedang";
    if (score === 4) return "Sulit";
    return "Sangat sulit";
  }
  if (score <= 1) return "Sangat rendah";
  if (score === 2) return "Rendah";
  if (score === 3) return "Sedang";
  if (score === 4) return "Tinggi";
  return "Sangat tinggi";
}

function ratingChipClass(score: number, reverse?: boolean): string {
  let effective: number;
  if (reverse) {
    effective = 6 - score;
  } else {
    effective = score;
  }
  if (effective <= 2) return "border-rose-500/40 bg-rose-900/40 text-rose-200";
  if (effective === 3) return "border-amber-500/40 bg-amber-900/40 text-amber-200";
  return "border-emerald-500/40 bg-emerald-900/40 text-emerald-200";
}

export function BaselineSection({ surveyAnswers }: { surveyAnswers: SurveyAnswer[] }) {
  const hasAny = useMemo(() => surveyAnswers.length > 0, [surveyAnswers.length]);

  if (!hasAny) {
    return (
      <section aria-label="Kuesioner Baseline" className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Kuesioner Baseline</p>
          <h2 className="text-lg font-semibold text-white">Hasil Pre-Survey</h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
          Belum ada jawaban kuesioner untuk user ini.
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Kuesioner Baseline" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Kuesioner Baseline</p>
        <h2 className="text-lg font-semibold text-white">Hasil Pre-Survey</h2>
      </div>

      {CATEGORIES.map((cat) => {
        const accent = ACCENT_CLASSES[cat.accent] ?? ACCENT_CLASSES.emerald;
        return (
          <div
            key={cat.title}
            className={`rounded-2xl border ${accent.ring} bg-white/5 p-5 shadow-inner shadow-black/20`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${accent.chipBg} border ${accent.chipBorder}`} />
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-200">{cat.title}</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.fields.map((field) => {
                const ans = resolveAnswer(surveyAnswers, field);

                if (field.kind === "rating") {
                  const score = parseRating(ans);
                  const max = field.max ?? 5;
                  if (score === null) {
                    return (
                      <div key={field.label} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">{field.label}</p>
                        <p className="text-sm font-medium text-white">-</p>
                      </div>
                    );
                  }
                  const chip = ratingChipClass(score, field.reverse);
                  const label = ratingLabel(score, max, field.reverse);
                  return (
                    <div key={field.label} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">{field.label}</p>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border ${chip} px-2.5 py-1 text-sm font-bold tabular-nums`}>
                          {score}{field.suffix ?? ""}
                        </span>
                        <span className="text-xs text-zinc-300">{label}</span>
                      </div>
                    </div>
                  );
                }

                const value = renderTextValue(ans);
                return (
                  <div key={field.label} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-400">{field.label}</p>
                    <p className="text-sm font-medium text-white whitespace-pre-line break-words">{value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}