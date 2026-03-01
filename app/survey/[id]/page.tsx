"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: boolean;
};

type SurveyMeta = {
  id: string;
  title: string;
  description: string | null;
};

type CustomerMeta = {
  guid: string;
  full_name: string | null;
  email: string | null;
};

type Step = "email" | "form" | "done";

export default function PublicSurveyPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const referralCode = search.get("ref") ?? "";
  const surveyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [step, setStep] = useState<Step>("email");
  const [survey, setSurvey] = useState<SurveyMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [customer, setCustomer] = useState<CustomerMeta | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, { answerText?: string; answerValue?: string | number; selectedOptions?: string[] }>>({});

  useEffect(() => {
    if (!referralCode) {
      setError("Kode referral (ref) wajib ada pada URL.");
    }
  }, [referralCode]);

  const onValidateEmail = async () => {
    if (!email || !referralCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/survey/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, referralCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.reason ?? body?.error ?? "Email tidak valid.");
      }
      const data = (await res.json()) as { customer: CustomerMeta; company: { id: string }; valid: boolean };
      setCustomer(data.customer);

      if (!surveyId) throw new Error("Survey id tidak valid.");

      const qsRes = await fetch(`/api/survey/${surveyId}/questions?ref=${encodeURIComponent(referralCode)}`);
      if (!qsRes.ok) {
        const body = await qsRes.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal memuat pertanyaan.");
      }
      const qsData = (await qsRes.json()) as { survey: SurveyMeta; questions: Question[] };
      setSurvey(qsData.survey);
      setQuestions(qsData.questions);
      setStep("form");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  const requiredUnfilled = useMemo(() => {
    if (step !== "form") return [];
    return questions
      .filter((q) => q.is_required)
      .filter((q) => {
        const ans = answers[q.id];
        if (!ans) return true;
        if (ans.selectedOptions && ans.selectedOptions.length > 0) return false;
        if (ans.answerText && ans.answerText.trim()) return false;
        if (ans.answerValue !== undefined && ans.answerValue !== null && String(ans.answerValue).length > 0) return false;
        return true;
      })
      .map((q) => q.question_text);
  }, [answers, questions, step]);

  const onSubmitSurvey = async () => {
    if (!customer || !referralCode) return;
    if (requiredUnfilled.length > 0) {
      setSubmitError("Harap lengkapi pertanyaan wajib.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        answerText: value.answerText ?? null,
        answerValue: value.answerValue ?? null,
        selectedOptions: value.selectedOptions ?? null,
      }));

      if (!surveyId) throw new Error("Survey id tidak valid.");

      const res = await fetch(`/api/survey/${surveyId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerGuid: customer.guid,
          referralCode,
          answers: payload,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal mengirim survey.");
      }

      setStep("done");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (questionId: string, patch: { answerText?: string; answerValue?: string | number; selectedOptions?: string[] }) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? {}), ...patch },
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl rounded-3xl bg-slate-900/60 p-6 shadow-2xl backdrop-blur">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-400">Survey</p>
            <h1 className="text-2xl font-semibold">
              {survey?.title ?? "Survey UMKM"}
            </h1>
            {survey?.description && (
              <p className="mt-1 text-sm text-slate-300">{survey.description}</p>
            )}
          </div>
          {referralCode && (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              Referral: {referralCode}
            </span>
          )}
        </header>

        {step === "email" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <div>
              <p className="text-sm font-semibold">Masukkan email Anda</p>
              <p className="text-xs text-slate-300">Kami gunakan untuk verifikasi bahwa Anda terdaftar di perusahaan yang mengirim survey.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
              />
              <button
                onClick={onValidateEmail}
                disabled={loading || !email || !referralCode}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-40"
              >
                {loading ? "Memeriksa..." : "Lanjutkan"}
              </button>
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
          </div>
        )}

        {step === "form" && (
          <div className="space-y-5">
            {questions.map((q, idx) => (
              <div key={q.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {idx + 1}. {q.question_text} {q.is_required && <span className="text-red-300">*</span>}
                  </p>
                </div>
                <QuestionInput
                  question={q}
                  value={answers[q.id]}
                  onChange={(patch) => setAnswer(q.id, patch)}
                />
              </div>
            ))}

            <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <button
                onClick={onSubmitSurvey}
                disabled={submitting}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Mengirim..." : "Kirim Survey"}
              </button>
              {submitError && <p className="text-sm text-red-300">{submitError}</p>}
              {requiredUnfilled.length > 0 && (
                <p className="text-xs text-amber-300">Masih ada pertanyaan wajib yang belum diisi.</p>
              )}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
            <p className="text-xl font-semibold text-emerald-300">Terima kasih!</p>
            <p className="text-sm text-slate-200">
              Jawaban Anda sudah kami terima. Silakan tutup halaman ini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value?: { answerText?: string; answerValue?: string | number; selectedOptions?: string[] };
  onChange: (patch: { answerText?: string; answerValue?: string | number; selectedOptions?: string[] }) => void;
}) {
  const opts = Array.isArray(question.options) ? question.options : [];

  if (question.question_type === "checkbox") {
    const selected = new Set(value?.selectedOptions ?? []);
    return (
      <div className="flex flex-col gap-2">
        {opts.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-slate-100">
            <input
              type="checkbox"
              checked={selected.has(opt)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(opt);
                else next.delete(opt);
                onChange({ selectedOptions: Array.from(next) });
              }}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500"
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (question.question_type === "multiple_choice" || question.question_type === "yes_no" || question.question_type === "dropdown") {
    return (
      <div className="grid gap-2 text-sm text-slate-100">
        {opts.map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input
              type="radio"
              name={question.id}
              checked={(value?.answerText ?? value?.answerValue) === opt}
              onChange={() => onChange({ answerText: opt, answerValue: opt, selectedOptions: [opt] })}
              className="h-4 w-4 border-slate-700 bg-slate-800 text-emerald-500"
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (question.question_type === "rating" || question.question_type === "nps") {
    const scale = 5;
    const current = Number(value?.answerValue ?? 0);
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: scale }, (_, idx) => idx + 1).map((num) => (
          <button
            key={num}
            onClick={() => onChange({ answerValue: num })}
            className={`h-9 w-9 rounded-full border text-sm font-semibold transition ${
              current === num ? "border-emerald-500 bg-emerald-500 text-black" : "border-slate-700 bg-slate-800 text-slate-200"
            }`}
          >
            {num}
          </button>
        ))}
      </div>
    );
  }

  return (
    <textarea
      value={value?.answerText ?? ""}
      onChange={(e) => onChange({ answerText: e.target.value })}
      placeholder="Ketik jawaban Anda..."
      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
      rows={3}
    />
  );
}
