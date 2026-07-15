"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type ParticipantRow = {
  key: string;
  customer_guid: string | null;
  email: string;
  full_name: string;
  attended: boolean;
  attended_at: string | null;
  attended_dates: string[];
  pre: number | null;
  post: number | null;
  delta: number | null;
  quiz_pre: { pct: number; correct: number } | null;
  quiz_post: { pct: number; correct: number } | null;
  quiz_delta: number | null;
};

type SurveyMeta = { pre: string | null; post: string | null; quiz: string | null; quiz_post: string | null };

type QuizSide = {
  answered: number;
  correct: number;
  pct: number;
  options: { label: string; count: number; pct: number; is_correct: boolean }[];
};

type QuizQuestion = {
  order_index: number;
  text: string;
  correct_answer: string;
  pre: QuizSide | null;
  post: QuizSide | null;
  delta: number | null;
};

type ProfileSide =
  | { kind: "choice"; answered: number; options: { label: string; count: number; pct: number }[] }
  | { kind: "text"; answered: number; answers: string[] };

type ProfileQuestion = {
  order_index: number;
  text: string;
  type: string;
  /** Asked in that sitting — not the same as answered yet. */
  in_pre: boolean;
  in_post: boolean;
  pre: ProfileSide | null;
  post: ProfileSide | null;
};

// Data encoding, not chrome: correct is the point, distractors are context.
// Validated on the dark surface (CVD deutan dE 16.9 vs the gray).
const CORRECT_COLOR = "#059669";
const WRONG_COLOR = "#71717a";

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [surveyMeta, setSurveyMeta] = useState<SurveyMeta>({ pre: null, post: null, quiz: null, quiz_post: null });
  const [quizTotal, setQuizTotal] = useState(0);
  const [quizBreakdown, setQuizBreakdown] = useState<QuizQuestion[]>([]);
  const [profileBreakdown, setProfileBreakdown] = useState<ProfileQuestion[]>([]);
  const [links, setLinks] = useState<{
    event_post: string | null;
    event_post_title: string | null;
    program_post: string | null;
  }>({ event_post: null, event_post_title: null, program_post: null });
  const [eventName, setEventName] = useState("");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [eventDays, setEventDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.localStorage.getItem("ip_token");
    if (!t) { router.replace("/login"); return; }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token || !eventId) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/events/${eventId}/attendance`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Gagal memuat data peserta.");
        const data = await res.json();
        setRows(data.attendance ?? []);
        setSurveyMeta(data.survey_meta ?? { pre: null, post: null, quiz: null, quiz_post: null });
        setQuizTotal(data.quiz_total ?? 0);
        setQuizBreakdown(data.quiz_breakdown ?? []);
        setProfileBreakdown(data.profile_breakdown ?? []);
        setLinks(data.links ?? { event_post: null, event_post_title: null, program_post: null });
        setEventName(data.event_name ?? "");
        setCompanyName(data.company_name ?? null);
        setEventDays(data.event_days ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      } finally { setLoading(false); }
    };
    load();
  }, [token, eventId]);

  // Lazy initialiser rather than an effect: no extra render, SSR-guarded.
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

  const stats = useMemo(() => {
    const deltas = rows.map((r) => r.delta).filter((d): d is number => d !== null);
    return {
      attended: rows.filter((r) => r.attended).length,
      pre: rows.filter((r) => r.pre !== null).length,
      post: rows.filter((r) => r.post !== null).length,
      avgDelta: deltas.length > 0
        ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10
        : null,
    };
  }, [rows]);

  const hasProgramSurvey = Boolean(surveyMeta.pre || surveyMeta.post);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Event</p>
          <h2 className="text-xl font-semibold">{eventName || "Detail Event"}</h2>
        </div>
        <button
          onClick={() => router.push("/dashboard/events")}
          className="shrink-0 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Kembali
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Link untuk Peserta</p>
        <p className="mb-4 text-[11px] text-zinc-500">
          Semua link meminta peserta memasukkan email lebih dulu.
        </p>

        <div className="space-y-3">
          <ShareLink
            label="Absensi (saat event)"
            hint="Peserta wajib mengisi survey Pre program & Pre event sebelum kehadiran tercatat."
            url={origin ? `${origin}/attendance/${eventId}` : ""}
          />
          <ShareLink
            label="Post Survey Event (setelah event)"
            hint={links.event_post_title ?? "Belum diatur untuk event ini."}
            url={origin && links.event_post ? `${origin}${links.event_post}` : ""}
          />
        </div>

        {!links.event_post && (
          <p className="mt-3 text-[11px] text-amber-300/80">
            Post survey event belum terhubung. Isi{" "}
            <span className="font-mono">training_events.post_survey_id</span> untuk memunculkan link-nya.
          </p>
        )}

        <p className="mt-4 border-t border-white/5 pt-3 text-[11px] text-zinc-500">
          Post survey <span className="text-zinc-400">program</span> berlaku lintas event — link-nya ada di{" "}
          <Link href="/dashboard/surveys" className="font-semibold text-emerald-400 hover:text-emerald-300">
            Hasil Survey
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          value={stats.attended}
          label={eventDays.length > 1 ? `Peserta hadir (${eventDays.length} hari)` : "Hadir"}
        />
        <StatCard value={stats.pre} label="Isi kondisi awal" />
        <StatCard value={stats.post} label="Isi kondisi akhir" />
        <StatCard
          value={stats.avgDelta === null ? "-" : `${stats.avgDelta > 0 ? "+" : ""}${stats.avgDelta}`}
          label="Δ kondisi usaha"
          tone={stats.avgDelta === null ? "neutral" : stats.avgDelta > 0 ? "up" : stats.avgDelta < 0 ? "down" : "neutral"}
        />
      </div>

      {eventDays.length > 1 && (
        <p className="text-[11px] text-zinc-500">
          Event {eventDays.length} hari ({eventDays[0]} — {eventDays[eventDays.length - 1]}).
          Peserta absen tiap hari; survey tetap sekali isi.
          Kolom Hadir menunjukkan berapa hari mereka datang.
        </p>
      )}

      {/* A configuration state, not a failure - so it is reported in neutral
          ink, and named on the company, since that is where these surveys live. */}
      {!loading && !hasProgramSurvey && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-400">
          <span className="font-semibold text-zinc-300">
            {companyName ?? "Perusahaan ini"} belum punya survey Kondisi Usaha.
          </span>{" "}
          Kolom Kondisi Usaha akan kosong sampai survey awal &amp; akhir diatur — berlaku untuk
          semua event perusahaan ini, bukan cuma event ini. Kolom Pengetahuan tidak terpengaruh.
        </div>
      )}

      {/* Two different measures share this table, so each is spelled out. The
          words "Pre/Post" are deliberately absent: they meant one thing for the
          rating survey and another for the quiz, and readers kept mixing them. */}
      <div className="space-y-1 text-xs text-zinc-500">
        {hasProgramSurvey && (
          <p>
            <span className="font-semibold text-zinc-400">Kondisi Usaha</span> = penilaian diri peserta,
            rata-rata pertanyaan rating skala 1-5.
            {surveyMeta.pre && <> Awal: <span className="text-zinc-400">{surveyMeta.pre}</span>.</>}
            {surveyMeta.post && <> Akhir: <span className="text-zinc-400">{surveyMeta.post}</span>.</>}
          </p>
        )}
        {surveyMeta.quiz && quizTotal > 0 && (
          <p>
            <span className="font-semibold text-zinc-400">Pengetahuan</span> = % jawaban benar dari{" "}
            {quizTotal} soal berkunci. Awal: <span className="text-zinc-400">{surveyMeta.quiz}</span>
            {surveyMeta.quiz_post && <>. Akhir: <span className="text-zinc-400">{surveyMeta.quiz_post}</span></>}.
          </p>
        )}
      </div>

      {loading && <p className="text-sm text-zinc-400">Memuat data peserta...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-sm text-zinc-400">
          Belum ada peserta yang absen atau mengisi survey.
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 md:block">
            <table className="w-full text-sm">
              {/* Grouped header: the two measures are different things, so the
                  eye should not have to remember which "Pre" is which. */}
              <thead className="bg-white/5">
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-4 pt-3" rowSpan={2}>Nama / Email</th>
                  <th className="px-4 pt-3" rowSpan={2}>Hadir</th>
                  <th className="border-l border-white/5 px-4 pt-3 text-center" colSpan={3}>
                    Kondisi Usaha <span className="normal-case text-zinc-600">(skala 1-5)</span>
                  </th>
                  <th className="border-l border-white/5 px-4 pt-3 text-right" rowSpan={2}>
                    Pengetahuan <span className="normal-case text-zinc-600">(% benar)</span>
                  </th>
                </tr>
                <tr className="text-xs uppercase tracking-wider text-zinc-400">
                  <th className="border-l border-white/5 px-4 pb-3 pt-1 text-right font-medium">Awal</th>
                  <th className="px-4 pb-3 pt-1 text-right font-medium">Akhir</th>
                  <th className="px-4 pb-3 pt-1 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      {/* full_name is often null in cms_customers - promote the
                          email rather than leading the row with a dash. */}
                      <div className="font-medium text-white">{r.full_name || r.email || "-"}</div>
                      {r.full_name && r.email && <div className="text-xs text-zinc-400">{r.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Attendance row={r} days={eventDays} />
                    </td>
                    <td className="border-l border-white/5 px-4 py-3 text-right"><Score value={r.pre} /></td>
                    <td className="px-4 py-3 text-right"><Score value={r.post} /></td>
                    <td className="px-4 py-3 text-right"><Delta value={r.delta} /></td>
                    <td className="border-l border-white/5 px-4 py-3 text-right"><Quiz row={r} total={quizTotal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="grid gap-3 md:hidden" data-table="peserta">
            {rows.map((r) => (
              <article key={r.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{r.full_name || r.email || "-"}</p>
                    {r.full_name && r.email && <p className="truncate text-xs text-zinc-400">{r.email}</p>}
                  </div>
                  <Attendance row={r} days={eventDays} />
                </div>
                <div className="mt-3">
                  <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-600">Kondisi usaha (1-5)</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Awal"><Score value={r.pre} /></MiniStat>
                    <MiniStat label="Akhir"><Score value={r.post} /></MiniStat>
                    <MiniStat label="Δ"><Delta value={r.delta} /></MiniStat>
                  </div>
                  <p className="mb-1 mt-2 text-[9px] uppercase tracking-wider text-zinc-600">Pengetahuan (% benar)</p>
                  <div className="rounded-xl border border-white/5 bg-white/5 px-2 py-2 text-center">
                    <Quiz row={r} total={quizTotal} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {quizBreakdown.length > 0 && <QuizAnalysis questions={quizBreakdown} meta={surveyMeta} />}
      {profileBreakdown.length > 0 && <ProfileAnalysis questions={profileBreakdown} />}
    </div>
  );
}

/**
 * The unscored half of the event survey. These questions have no right answer,
 * so they never belong in the quiz analysis - but they are the only record of
 * how participants actually work and what they asked for.
 */
function ProfileAnalysis({ questions }: { questions: ProfileQuestion[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-sm font-semibold text-white">Profil &amp; Masukan Peserta</h3>
      <p className="mb-4 text-xs text-zinc-500">
        Pertanyaan tanpa kunci jawaban — tidak dinilai benar/salah, tapi inilah potret kondisi
        dan suara peserta.
      </p>

      <div className="space-y-3">
        {questions.map((q) => {
          const isOpen = open === q.order_index;
          const side = q.pre ?? q.post;
          if (!side) return null;

          return (
            <div key={q.order_index} className="rounded-xl border border-white/5 bg-white/5 p-3">
              <button onClick={() => setOpen(isOpen ? null : q.order_index)} className="w-full text-left">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-xs text-zinc-300">
                    {q.order_index}. {q.text}
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-500">
                    {side.answered} jawaban
                    {q.in_post
                      ? q.post
                        ? " · Pre & Post"
                        : " · Post belum diisi"
                      : " · hanya di Pre"}
                    <span className="ml-2 text-zinc-600">{isOpen ? "tutup" : "lihat"}</span>
                  </span>
                </div>

                {/* A choice question is worth showing collapsed: the distribution
                    IS the profile. Free text needs opening. */}
                {side.kind === "choice" && !isOpen && (
                  <div className="mt-2 space-y-[2px]">
                    {side.options.filter((o) => o.count > 0).slice(0, 3).map((o) => (
                      <div key={o.label} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 truncate text-[10px] text-zinc-500">{o.label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-zinc-900">
                          <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(o.pct, 0.5)}%`, background: WRONG_COLOR }} />
                        </div>
                        <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-zinc-600">{o.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="mt-3 border-t border-white/5 pt-3">
                  {side.kind === "choice" ? (
                    <ChoiceProfile pre={q.pre} post={q.post} />
                  ) : (
                    <TextProfile pre={q.pre} post={q.post} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChoiceProfile({ pre, post }: { pre: ProfileSide | null; post: ProfileSide | null }) {
  if (pre?.kind !== "choice" && post?.kind !== "choice") return null;
  const labels = [...new Set([
    ...(pre?.kind === "choice" ? pre.options.map((o) => o.label) : []),
    ...(post?.kind === "choice" ? post.options.map((o) => o.label) : []),
  ])];
  const find = (s: ProfileSide | null, l: string) =>
    s?.kind === "choice" ? s.options.find((o) => o.label === l) ?? null : null;
  const hasPost = post?.kind === "choice";

  return (
    <div className="space-y-3">
      {hasPost && (
        <p className="text-[10px] uppercase tracking-wider text-zinc-600">Abu-abu = sebelum · Hijau = sesudah</p>
      )}
      {labels.map((label) => {
        const p = find(pre, label);
        const s = find(post, label);
        const d = p && s ? s.pct - p.pct : null;
        return (
          <div key={label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-[11px] text-zinc-400">{label}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                {p?.pct ?? 0}% <span className="text-zinc-700">({p?.count ?? 0})</span>
                {d !== null && (
                  <span className={`ml-2 font-semibold ${d > 0 ? "text-emerald-400" : d < 0 ? "text-red-400" : "text-zinc-600"}`}>
                    {d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}{d}pp
                  </span>
                )}
              </span>
            </div>
            <div className="space-y-[2px]">
              <QuizBar pct={p?.pct ?? 0} color={hasPost ? WRONG_COLOR : CORRECT_COLOR} thin />
              {hasPost && <QuizBar pct={s?.pct ?? 0} color={CORRECT_COLOR} thin />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TEXT_PREVIEW = 8;

function TextProfile({ pre, post }: { pre: ProfileSide | null; post: ProfileSide | null }) {
  const [all, setAll] = useState(false);
  const list = (s: ProfileSide | null, label: string) => {
    if (s?.kind !== "text") return null;
    const shown = all ? s.answers : s.answers.slice(0, TEXT_PREVIEW);
    return (
      <div>
        {post && <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-600">{label}</p>}
        <div className="space-y-1">
          {shown.map((a, i) => (
            <p key={i} className="rounded-lg bg-zinc-900 px-3 py-2 text-[11px] leading-relaxed text-zinc-300">
              &ldquo;{a}&rdquo;
            </p>
          ))}
        </div>
        {s.answers.length > TEXT_PREVIEW && (
          <button
            onClick={() => setAll((v) => !v)}
            className="mt-2 text-[11px] font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            {all ? "Tampilkan lebih sedikit" : `Lihat semua (${s.answers.length})`}
          </button>
        )}
      </div>
    );
  };

  if (!post) return list(pre, "Pre");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list(pre, "Pre")}
      {list(post, "Post")}
    </div>
  );
}

/**
 * Which material didn't land. Sorted hardest-first by the API, so the questions
 * that need re-teaching are what you see without scrolling.
 */
function QuizAnalysis({ questions, meta }: { questions: QuizQuestion[]; meta: SurveyMeta }) {
  const [open, setOpen] = useState<number | null>(null);
  const hasPost = questions.some((q) => q.post);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Analisis Kuis</h3>
        <span className="text-[11px] text-zinc-500">
          {hasPost ? "yang masih lemah di atas" : "tersulit di atas"}
        </span>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        % peserta yang menjawab benar.{" "}
        {hasPost
          ? "Abu-abu = sebelum event, hijau = sesudah."
          : `${meta.quiz ?? "Kuis"} — post-test belum ada, jadi belum ada pembanding.`}
      </p>

      <div className="space-y-3">
        {questions.map((q) => {
          const isOpen = open === q.order_index;
          const headline = q.post ?? q.pre;
          return (
            <div key={q.order_index} className="rounded-xl border border-white/5 bg-white/5 p-3">
              <button onClick={() => setOpen(isOpen ? null : q.order_index)} className="w-full text-left">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-xs text-zinc-300">{q.order_index}. {q.text}</span>
                  <span className="shrink-0 whitespace-nowrap text-xs tabular-nums">
                    <span className="text-zinc-500">{q.pre ? `${q.pre.pct}%` : "—"}</span>
                    <span className="mx-1 text-zinc-700">→</span>
                    <span className={`font-semibold ${headline ? quizColor(q.post?.pct ?? q.pre!.pct) : "text-zinc-600"}`}>
                      {q.post ? `${q.post.pct}%` : "—"}
                    </span>
                    {q.delta !== null && (
                      <span className={`ml-2 font-semibold ${q.delta > 0 ? "text-emerald-400" : q.delta < 0 ? "text-red-400" : "text-zinc-500"}`}>
                        {q.delta > 0 ? "▲ +" : q.delta < 0 ? "▼ " : ""}{q.delta}pp
                      </span>
                    )}
                  </span>
                </div>

                {/* Two thin bars, 2px surface gap - pre in context gray, post in accent. */}
                <div className="space-y-[2px]">
                  <QuizBar pct={q.pre?.pct ?? null} color={WRONG_COLOR} label="Pre" />
                  {hasPost && <QuizBar pct={q.post?.pct ?? null} color={CORRECT_COLOR} label="Post" />}
                </div>
              </button>

              {isOpen && (
                <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
                  {(q.post ?? q.pre)!.options.map((o) => {
                    const preO = q.pre?.options.find((x) => x.label === o.label);
                    const postO = q.post?.options.find((x) => x.label === o.label);
                    return (
                      <div key={o.label}>
                        <div className="mb-1 flex items-baseline justify-between gap-3">
                          <span className="min-w-0 break-words text-[11px] text-zinc-400">
                            {o.label}
                            {o.is_correct && <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-400">Kunci</span>}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                            {preO ? `${preO.pct}%` : "—"} <span className="text-zinc-700">→</span> {postO ? `${postO.pct}%` : "—"}
                          </span>
                        </div>
                        <div className="space-y-[2px]">
                          <QuizBar pct={preO?.pct ?? null} color={o.is_correct ? CORRECT_COLOR : WRONG_COLOR} thin />
                          {hasPost && <QuizBar pct={postO?.pct ?? null} color={o.is_correct ? CORRECT_COLOR : WRONG_COLOR} thin dim={!o.is_correct} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuizBar({ pct, color, label, thin = false, dim = false }: { pct: number | null; color: string; label?: string; thin?: boolean; dim?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-7 shrink-0 text-[9px] uppercase text-zinc-600">{label}</span>}
      <div className={`${thin ? "h-1.5" : "h-2"} flex-1 overflow-hidden rounded-sm bg-zinc-900`}>
        <div
          className="h-full rounded-r-[4px]"
          style={{ width: `${Math.max(pct ?? 0, 0.5)}%`, background: color, opacity: pct === null ? 0.15 : dim ? 0.55 : 1 }}
        />
      </div>
    </div>
  );
}

function ShareLink({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-3">
      <p className="text-[11px] font-semibold text-zinc-300">{label}</p>
      <p className="mb-2 truncate text-[11px] text-zinc-500" title={hint}>{hint}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={url || "—"}
          readOnly
          disabled={!url}
          suppressHydrationWarning
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50"
        />
        <button
          onClick={onCopy}
          disabled={!url}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
        >
          {copied ? "Tersalin!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function StatCard({ value, label, tone = "neutral" }: { value: number | string; label: string; tone?: "up" | "down" | "neutral" }) {
  const color = tone === "up" ? "text-emerald-400" : tone === "down" ? "text-red-400" : "text-zinc-200";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}

function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

/**
 * Single-day events read as Ya/Tidak; multi-day ones report coverage, because
 * "hadir" alone hides someone who only showed up on day 1.
 */
function Attendance({ row, days }: { row: ParticipantRow; days: string[] }) {
  const total = days.length;

  if (total <= 1) {
    return (
      <div>
        <Pill tone={row.attended ? "up" : "neutral"}>{row.attended ? "Ya" : "Tidak"}</Pill>
        {row.attended_at && (
          <div className="mt-1 text-[11px] text-zinc-500">
            {new Date(row.attended_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
          </div>
        )}
      </div>
    );
  }

  const n = row.attended_dates.length;
  const tone = n === 0 ? "neutral" : n === total ? "up" : "partial";
  return (
    <div>
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          tone === "up" ? "bg-emerald-500/20 text-emerald-300"
            : tone === "partial" ? "bg-amber-500/20 text-amber-300"
              : "bg-zinc-500/20 text-zinc-400"
        }`}
      >
        {n}/{total} hari
      </span>
      {n > 0 && (
        <div className="mt-1 flex gap-1">
          {days.map((d, i) => (
            <span
              key={d}
              title={d}
              className={`h-1.5 w-4 rounded-sm ${row.attended_dates.includes(d) ? "bg-emerald-500" : "bg-zinc-700"}`}
              aria-label={`Hari ${i + 1}: ${row.attended_dates.includes(d) ? "hadir" : "tidak"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: "up" | "neutral"; children: React.ReactNode }) {
  const cls = tone === "up"
    ? "bg-emerald-500/20 text-emerald-300"
    : "bg-zinc-500/20 text-zinc-400";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-600">-</span>;
  return (
    <span className="font-semibold text-white">
      {value}
      <span className="text-xs font-normal text-zinc-500">/5</span>
    </span>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-zinc-600">-</span>;
  if (value === 0) return <span className="font-semibold text-zinc-400">0</span>;
  const up = value > 0;
  return (
    <span className={`font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? "▲" : "▼"} {up ? "+" : ""}{value}
    </span>
  );
}

const quizColor = (pct: number) =>
  pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-amber-300" : "text-red-400";

/**
 * The quiz is sat twice with the same questions, so the pair is the point -
 * a lone post score hides whether anything was learned.
 */
function Quiz({ row, total }: { row: ParticipantRow; total: number }) {
  const { quiz_pre: pre, quiz_post: post, quiz_delta: d } = row;
  if (!pre && !post) return <span className="text-zinc-600">-</span>;

  return (
    <div className="whitespace-nowrap">
      <span className="tabular-nums">
        <span className={pre ? quizColor(pre.pct) : "text-zinc-600"}>{pre ? `${pre.pct}%` : "—"}</span>
        <span className="mx-1 text-zinc-700">→</span>
        <span className={`font-semibold ${post ? quizColor(post.pct) : "text-zinc-600"}`}>{post ? `${post.pct}%` : "—"}</span>
      </span>
      {d !== null && (
        <span className={`ml-2 text-xs font-semibold tabular-nums ${d > 0 ? "text-emerald-400" : d < 0 ? "text-red-400" : "text-zinc-500"}`}>
          {d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}{d}pp
        </span>
      )}
      {total > 0 && (
        <div className="text-[10px] text-zinc-600">
          {pre ? `${pre.correct}` : "—"}/{total} → {post ? `${post.correct}` : "—"}/{total}
        </div>
      )}
    </div>
  );
}
