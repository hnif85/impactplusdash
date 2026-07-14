"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Program results: Pre vs Post.
 *
 * Chart colors are fixed tokens, not Tailwind classes, because they are data
 * encoding rather than UI chrome. Post is the point (emerald); Pre is context
 * (gray) - an emphasis pair, not two categorical identities.
 * Validated for the dark surface: lightness band PASS, CVD deutan dE 16.9, contrast PASS.
 */
const PRE_COLOR = "#71717a";
const POST_COLOR = "#059669";
const SURFACE = "#141414";

type Side = {
  total_answers: number;
  average: number | null;
  breakdown: { label: string; count: number; pct: number }[] | null;
  answers: string[] | null;
};

type PairedQuestion = {
  order_index: number;
  text: string;
  type: string;
  pre: Side;
  post: Side;
  delta: number | null;
};

type ProgramResults = {
  company_name: string | null;
  program: {
    pre: { id: string; title: string | null; respondents: number } | null;
    post: { id: string; title: string | null; respondents: number } | null;
  };
  overall: { pre: number | null; post: number | null; delta: number | null };
  links?: { program_post: string | null; program_pre: string | null };
  rating_scale_max?: number;
  questions: PairedQuestion[];
};

export default function SurveyResultsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProgramResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const token = window.localStorage.getItem("ip_token");
      if (!token) { router.replace("/login"); return; }

      const referral = window.localStorage.getItem("ip_referral_code") ?? "";
      try {
        setLoading(true);
        const qs = new URLSearchParams({ referral_code: referral });
        const res = await fetch(`/api/survey-results?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Gagal memuat hasil survey.");
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      } finally { setLoading(false); }
    };
    load();
  }, [router]);

  const max = data?.rating_scale_max ?? 5;
  const hasProgram = Boolean(data?.program.pre || data?.program.post);
  const ratingQuestions = (data?.questions ?? []).filter((q) => q.type === "rating" || q.type === "nps");
  const allChoice = (data?.questions ?? []).filter((q) =>
    ["multiple_choice", "dropdown", "yes_no", "checkbox"].includes(q.type)
  );
  // A card that only says "no answers yet" is noise. Hide the unanswered ones
  // and account for them once, so the page is only what there is to read.
  const choiceQuestions = allChoice.filter((q) => q.pre.total_answers > 0 || q.post.total_answers > 0);
  const hiddenChoice = allChoice.length - choiceQuestions.length;
  const textQuestions = (data?.questions ?? []).filter((q) => q.type === "text");
  const answeredText = textQuestions.filter(
    (q) => (q.pre.answers?.length ?? 0) > 0 || (q.post.answers?.length ?? 0) > 0
  );
  const hiddenText = textQuestions.length - answeredText.length;
  const hiddenTotal = hiddenChoice + hiddenText;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Survey Program</p>
        <h2 className="text-xl font-semibold">Hasil Pre &amp; Post</h2>
        {data?.company_name && <p className="text-sm text-zinc-400">{data.company_name}</p>}
      </div>

      {loading && <p className="text-sm text-zinc-400">Memuat...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && !hasProgram && (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-sm text-zinc-400">
          Perusahaan ini belum punya survey program. Atur{" "}
          <span className="font-mono text-xs text-zinc-300">metadata.program_pre_survey_id</span> dan{" "}
          <span className="font-mono text-xs text-zinc-300">program_post_survey_id</span> untuk melihat perbandingan Pre &amp; Post di sini.
          <p className="mt-2 text-xs text-zinc-500">
            Kuis materi tidak tampil di halaman ini — kuis milik satu event, lihat di detail event masing-masing.
          </p>
        </div>
      )}

      {!loading && !error && hasProgram && data && (
        <>
          <Hero overall={data.overall} max={max} program={data.program} />

          <PostSurveyLink url={data.links?.program_post ?? null} title={data.program.post?.title ?? null} />

          <Legend />

          {ratingQuestions.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-sm font-semibold text-white">Skor per pertanyaan</h3>
              <p className="mb-5 text-xs text-zinc-500">Skala {max}. Titik kiri = Pre, titik kanan = Post.</p>
              <div className="space-y-5">
                {ratingQuestions.map((q) => (
                  <Dumbbell key={q.order_index} q={q} max={max} />
                ))}
              </div>
            </section>
          )}

          {choiceQuestions.map((q) => (
            <ChoiceCompare key={q.order_index} q={q} />
          ))}

          {answeredText.map((q) => (
            <TextCompare key={q.order_index} q={q} />
          ))}

          {hiddenTotal > 0 && (
            <p className="text-xs text-zinc-600">
              {hiddenTotal} pertanyaan lain belum ada jawabannya, disembunyikan.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The program post-survey is collected after the program, so admins need the
 * shareable link here rather than inside any one event.
 */
function PostSurveyLink({ url, title }: { url: string | null; title: string | null }) {
  // Lazy initialiser rather than an effect: no extra render, and the SSR guard
  // keeps it safe. The input suppresses the hydration diff on `value`.
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const [copied, setCopied] = useState(false);

  const full = url && origin ? `${origin}${url}` : "";

  const onCopy = () => {
    if (!full) return;
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Link Post Survey Program</p>
      <p className="mb-3 text-[11px] text-zinc-500">
        {title ?? "Post survey program belum diatur."} Bagikan ke peserta setelah program selesai — mereka harus memasukkan email dulu.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={full || "—"}
          readOnly
          disabled={!full}
          suppressHydrationWarning
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50"
        />
        <button
          onClick={onCopy}
          disabled={!full}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {copied ? "Tersalin!" : "Copy"}
        </button>
      </div>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRE_COLOR }} />
        Pre
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: POST_COLOR }} />
        Post
      </span>
    </div>
  );
}

function DeltaTag({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-xs text-zinc-600">—</span>;
  if (value === 0) return <span className="text-xs font-semibold tabular-nums text-zinc-500">0{suffix}</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"} {up ? "+" : ""}{value}{suffix}
    </span>
  );
}

function Hero({
  overall, max, program,
}: {
  overall: ProgramResults["overall"];
  max: number;
  program: ProgramResults["program"];
}) {
  const pct = (v: number) => ((v - 1) / (max - 1)) * 100;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-wider text-zinc-500">Skor program keseluruhan</p>

      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex items-end gap-3">
          <span className="text-5xl font-bold tabular-nums text-white">
            {overall.post ?? overall.pre ?? "—"}
          </span>
          <span className="pb-1.5 text-lg text-zinc-500">/ {max}</span>
        </div>
        <div className="pb-1.5">
          {overall.delta !== null ? (
            <>
              <p className={`text-2xl font-bold tabular-nums ${overall.delta > 0 ? "text-emerald-400" : overall.delta < 0 ? "text-red-400" : "text-zinc-400"}`}>
                {overall.delta > 0 ? "▲ +" : overall.delta < 0 ? "▼ " : ""}{overall.delta}
              </p>
              <p className="text-xs text-zinc-500">dari {overall.pre} ke {overall.post}</p>
            </>
          ) : (
            <p className="text-xs text-zinc-500">
              {overall.pre === null && overall.post === null
                ? "Belum ada jawaban rating."
                : "Perlu Pre dan Post untuk menghitung perubahan."}
            </p>
          )}
        </div>
      </div>

      {overall.pre !== null && overall.post !== null && (
        <div className="mt-6">
          <div className="relative h-2.5 rounded-full bg-zinc-900">
            <div
              className="absolute h-2.5 rounded-full"
              style={{
                left: `${Math.min(pct(overall.pre), pct(overall.post))}%`,
                width: `${Math.abs(pct(overall.post) - pct(overall.pre))}%`,
                background: overall.delta! >= 0 ? POST_COLOR : "#dc2626",
                opacity: 0.35,
              }}
            />
            <Dot left={pct(overall.pre)} color={PRE_COLOR} />
            <Dot left={pct(overall.post)} color={POST_COLOR} />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-zinc-600">
            <span>1</span><span>{max}</span>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <RespondentTile label="Responden Pre" title={program.pre?.title} n={program.pre?.respondents ?? 0} color={PRE_COLOR} />
        <RespondentTile label="Responden Post" title={program.post?.title} n={program.post?.respondents ?? 0} color={POST_COLOR} />
      </div>
    </section>
  );
}

function RespondentTile({ label, title, n, color }: { label: string; title?: string | null; n: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      </div>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">{n}</p>
      <p className="truncate text-[11px] text-zinc-500" title={title ?? undefined}>{title ?? "Belum diatur"}</p>
    </div>
  );
}

/** 10px dot with a 2px surface ring so overlapping Pre/Post stay legible. */
function Dot({ left, color }: { left: number; color: string }) {
  return (
    <span
      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${left}%`, background: color, boxShadow: `0 0 0 2px ${SURFACE}` }}
    />
  );
}

function Dumbbell({ q, max }: { q: PairedQuestion; max: number }) {
  const pct = (v: number) => ((v - 1) / (max - 1)) * 100;
  const { pre, post } = q;
  const both = pre.average !== null && post.average !== null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-xs text-zinc-300">
          {q.order_index}. {q.text}
        </p>
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="text-xs tabular-nums text-zinc-500">
            {pre.average ?? "—"} <span className="text-zinc-700">→</span>{" "}
            <span className="font-semibold text-white">{post.average ?? "—"}</span>
          </span>
          <DeltaTag value={q.delta} />
        </div>
      </div>

      <div className="relative h-2.5 rounded-full bg-zinc-900">
        {both && (
          <div
            className="absolute h-2.5 rounded-full"
            style={{
              left: `${Math.min(pct(pre.average!), pct(post.average!))}%`,
              width: `${Math.abs(pct(post.average!) - pct(pre.average!))}%`,
              background: q.delta! >= 0 ? POST_COLOR : "#dc2626",
              opacity: 0.3,
            }}
          />
        )}
        {pre.average !== null && <Dot left={pct(pre.average)} color={PRE_COLOR} />}
        {post.average !== null && <Dot left={pct(post.average)} color={POST_COLOR} />}
      </div>
    </div>
  );
}

function ChoiceCompare({ q }: { q: PairedQuestion }) {
  const labels = [...new Set([
    ...(q.pre.breakdown ?? []).map((b) => b.label),
    ...(q.post.breakdown ?? []).map((b) => b.label),
  ])];

  const find = (side: Side, label: string) => side.breakdown?.find((b) => b.label === label) ?? null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm font-semibold text-white">
        {q.order_index}. {q.text}
      </p>
      <p className="mb-4 text-xs text-zinc-500">
        Pre {q.pre.total_answers} jawaban · Post {q.post.total_answers} jawaban
      </p>

      <div className="space-y-3">
        {labels.map((label) => {
          const p = find(q.pre, label);
          const s = find(q.post, label);
          const d = p && s ? s.pct - p.pct : null;
          return (
            <div key={label}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words text-xs text-zinc-300">{label}</span>
                <DeltaTag value={d} suffix="pp" />
              </div>
              {/* Two thin bars, 2px surface gap between them - no strokes. */}
              <div className="space-y-[2px]">
                <Bar pct={p?.pct ?? 0} count={p?.count ?? 0} color={PRE_COLOR} />
                <Bar pct={s?.pct ?? 0} count={s?.count ?? 0} color={POST_COLOR} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Bar({ pct, count, color }: { pct: number; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-zinc-900">
        <div
          className="h-full rounded-r-[4px]"
          style={{ width: `${Math.max(pct, 0.5)}%`, background: color }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
        {pct}% <span className="text-zinc-700">({count})</span>
      </span>
    </div>
  );
}

const TEXT_PREVIEW = 5;

function TextCompare({ q }: { q: PairedQuestion }) {
  const [expanded, setExpanded] = useState<"pre" | "post" | null>(null);

  const list = (side: Side, which: "pre" | "post") => {
    const all = side.answers ?? [];
    if (all.length === 0) return <p className="text-xs text-zinc-600">Belum ada jawaban.</p>;
    const shown = expanded === which ? all : all.slice(0, TEXT_PREVIEW);
    return (
      <div className="space-y-1">
        {shown.map((a, i) => (
          <p key={i} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-300">&ldquo;{a}&rdquo;</p>
        ))}
        {all.length > TEXT_PREVIEW && (
          <button
            onClick={() => setExpanded(expanded === which ? null : which)}
            className="mt-1 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            {expanded === which ? "Tampilkan lebih sedikit" : `Lihat semua (${all.length})`}
          </button>
        )}
      </div>
    );
  };

  if ((q.pre.answers?.length ?? 0) === 0 && (q.post.answers?.length ?? 0) === 0) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="mb-4 text-sm font-semibold text-white">
        {q.order_index}. {q.text}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: PRE_COLOR }} />
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Pre</p>
          </div>
          {list(q.pre, "pre")}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: POST_COLOR }} />
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Post</p>
          </div>
          {list(q.post, "post")}
        </div>
      </div>
    </section>
  );
}
