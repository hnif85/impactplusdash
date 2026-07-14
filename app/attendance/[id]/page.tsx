"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Question = {
  id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: boolean;
};

type Customer = { guid: string; full_name: string; email: string };

type ValidateResult =
  | { status: "unregistered" }
  | { status: "already_attended"; customer: Customer }
  | { status: "needs_survey"; customer: Customer; survey_id: string }
  | { status: "needs_attendance"; customer: Customer };

type Step = "email" | "unregistered" | "survey" | "confirm_attendance" | "done";

export default function AttendancePage() {
  const params = useParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [surveyMeta, setSurveyMeta] = useState<{ title: string; description: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, { answerText?: string; answerValue?: string | number; selectedOptions?: string[] }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [eventName, setEventName] = useState("");
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/attendance/${eventId}/info`);
        if (res.ok) {
          const data = await res.json();
          setEventName(data.name ?? "");
        }
      } catch {}
    };
    if (eventId) fetchEvent();
  }, [eventId]);

  const doValidate = async () => {
    if (!email || !eventId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/${eventId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal validasi email.");
      }

      const data = (await res.json()) as any;
      setCustomer(data.customer ?? null);
      setReferralCode(data.referral_code ?? "");

      if (data.status === "unregistered") {
        setStep("unregistered");
      } else if (data.status === "already_attended") {
        setStep("done");
      } else if (data.status === "needs_survey") {
        setSurveyId(data.survey_id);
        setQuestions([]);
        setAnswers({});
        const qsRes = await fetch(`/api/survey/${data.survey_id}/questions?ref=${encodeURIComponent(data.referral_code)}`);
        if (qsRes.ok) {
          const qsData = await qsRes.json();
          setQuestions(qsData.questions ?? []);
          setSurveyMeta(qsData.survey ?? null);
        }
        setStep("survey");
      } else if (data.status === "needs_attendance") {
        setStep("confirm_attendance");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  const requiredUnfilled = useMemo(() => {
    if (step !== "survey") return [];
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
    if (!customer || !eventId || !surveyId) return;
    if (requiredUnfilled.length > 0) {
      setError("Harap lengkapi pertanyaan wajib.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const surveyAnswers = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        answerText: value.answerText ?? null,
        answerValue: value.answerValue ?? null,
        selectedOptions: value.selectedOptions ?? null,
      }));

      const res = await fetch(`/api/attendance/${eventId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          customerGuid: customer.guid,
          surveyId,
          surveyAnswers,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menyimpan survey.");
      }

      // Re-validate to check if more surveys pending
      setStep("email");
      await doValidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitAttendance = async () => {
    if (!customer || !eventId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/${eventId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          customerGuid: customer.guid,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal submit absensi.");
      }

      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
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
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-400">Absensi Event</p>
          <h1 className="text-2xl font-semibold">{eventName || "Absensi Peserta"}</h1>
        </header>

        {step === "email" && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <div>
              <p className="text-sm font-semibold">Masukkan email Anda</p>
              <p className="text-xs text-slate-300">Kami gunakan untuk verifikasi bahwa Anda terdaftar sebagai peserta.</p>
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
                onClick={doValidate}
                disabled={loading || !email}
                className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-40"
              >
                {loading ? "Memeriksa..." : "Lanjutkan"}
              </button>
            </div>
            {error && <p className="text-sm text-red-300">{error}</p>}
          </div>
        )}

        {step === "unregistered" && (
          <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-amber-300">Email Tidak Terdaftar</p>
            <p className="text-sm text-slate-300">
              Email <strong>{email}</strong> tidak ditemukan dalam daftar peserta event ini.
            </p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
              <button
                onClick={() => { setStep("email"); setError(null); }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Coba Email Lain
              </button>
              <button
                onClick={() => setStep("done")}
                className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-800/40"
              >
                Hubungi Admin Program
              </button>
            </div>
          </div>
        )}

        {step === "survey" && (
          <div className="space-y-5">
            {surveyMeta && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                <p className="text-xs uppercase tracking-[0.15em] text-emerald-400">Survey</p>
                <h2 className="text-lg font-semibold">{surveyMeta.title}</h2>
                {surveyMeta.description && (
                  <p className="text-sm text-slate-300">{surveyMeta.description}</p>
                )}
              </div>
            )}

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
                {submitting ? "Memproses..." : "Kirim Survey"}
              </button>
              {error && <p className="text-sm text-red-300">{error}</p>}
              {requiredUnfilled.length > 0 && (
                <p className="text-xs text-amber-300">Masih ada pertanyaan wajib yang belum diisi.</p>
              )}
            </div>
          </div>
        )}

        {step === "confirm_attendance" && (
          <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <p className="text-lg font-semibold text-emerald-300">Konfirmasi Absensi</p>
            <p className="text-sm text-slate-300">
              Selamat datang, <strong>{customer?.full_name || email}</strong>! Klik tombol di bawah untuk melakukan absensi.
            </p>
              <button
                onClick={onSubmitAttendance}
                disabled={submitting}
              className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Memproses..." : "Saya Hadir"}
            </button>
            {error && <p className="text-sm text-red-300">{error}</p>}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
            <p className="text-xl font-semibold text-emerald-300">Terima kasih!</p>
            <p className="text-sm text-slate-200">
              Absensi Anda sudah tercatat. Silakan tutup halaman ini.
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
