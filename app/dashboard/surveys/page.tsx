"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Breakdown = { label: string; count: number; pct: number; isCorrect: boolean | null };
type QuestionResult = {
  id: string; order_index: number; text: string; type: string;
  correct_answer: string | null; total_answers: number;
  breakdown?: Breakdown[]; average?: number; distribution?: { label: string; count: number }[];
  answers?: string[];
};
type SurveyResult = {
  id: string; title: string; description: string | null; type: string;
  total_respondents: number; questions: QuestionResult[];
};

export default function SurveyResultsPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<SurveyResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
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
        if (!res.ok) { throw new Error("Gagal memuat hasil survey."); }
        const data = await res.json();
        setSurveys(data.surveys ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      } finally { setLoading(false); }
    };
    load();
  }, [router]);

  const survey = surveys[selectedIdx];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Survey</p>
        <h2 className="text-xl font-semibold">Hasil Survey</h2>
      </div>

      {loading && <p className="text-sm text-zinc-400">Memuat...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && surveys.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-sm text-zinc-400">
          Belum ada data survey.
        </div>
      )}

      {surveys.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {surveys.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSelectedIdx(i)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                i === selectedIdx
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/60"
                  : "border border-white/10 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {s.title} ({s.total_respondents})
            </button>
          ))}
        </div>
      )}

      {survey && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-semibold text-white">{survey.title}</p>
            {survey.description && <p className="text-xs text-zinc-400">{survey.description}</p>}
            <p className="mt-2 text-xs text-zinc-500">{survey.total_respondents} responden</p>
          </div>

          {survey.questions.map((q) => (
            <div key={q.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-sm font-semibold text-white">
                {q.order_index}. {q.text}
                {q.total_answers > 0 && <span className="ml-2 text-xs font-normal text-zinc-500">({q.total_answers} jawaban)</span>}
              </p>

              {q.type === "text" && (
                <div className="space-y-1">
                  {(q.answers ?? []).length === 0 && <p className="text-xs text-zinc-500">Belum ada jawaban.</p>}
                  {(q.answers ?? []).map((a, i) => (
                    <p key={i} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-300">&ldquo;{a}&rdquo;</p>
                  ))}
                </div>
              )}

              {q.type === "rating" || q.type === "nps" ? (
                <div>
                  <p className="mb-2 text-lg font-bold text-emerald-400">{q.average ?? "-"}</p>
                  <div className="flex flex-wrap gap-2">
                    {(q.distribution ?? []).map((d) => (
                      <div key={d.label} className="rounded-lg bg-zinc-900 px-3 py-2 text-center text-xs">
                        <p className="font-semibold text-white">{d.count}</p>
                        <p className="text-zinc-400">Nilai {d.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (q.type === "multiple_choice" || q.type === "dropdown" || q.type === "yes_no" || q.type === "checkbox") ? (
                <div className="space-y-2">
                  {(q.breakdown ?? []).map((b) => (
                    <div key={b.label} className="flex items-center gap-3">
                      <div className="w-32 truncate text-right text-xs text-zinc-300">{b.label}</div>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-900">
                        <div
                          className={`h-full rounded ${b.isCorrect === true ? "bg-emerald-500" : b.isCorrect === false ? "bg-red-500" : "bg-emerald-500/50"}`}
                          style={{ width: `${Math.max(b.pct, 2)}%` }}
                        />
                      </div>
                      <div className="w-10 text-right text-xs text-zinc-400">{b.pct}%</div>
                      <div className="w-6 text-xs text-zinc-500">{b.count}</div>
                      {q.correct_answer && b.label === q.correct_answer && (
                        <span className="text-[10px] font-semibold text-emerald-400">Kunci</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
