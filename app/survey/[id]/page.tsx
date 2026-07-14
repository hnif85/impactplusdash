"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Shell, Heading, Label, TextInput, PrimaryButton, Divider,
  NoteBox, Callout, ErrorText, INK, INK_SOFT, MUTED, LINE,
  type Brand,
} from "@/components/participant/Shell";
import { QuestionCard, type Question, type AnswerPatch } from "@/components/participant/QuestionInput";

type SurveyMeta = { id: string; title: string; description: string | null };
type CustomerMeta = { guid: string; full_name: string | null; email: string | null };
type Step = "email" | "form" | "done";

const STEPS = [
  { n: "01", label: "VERIFIKASI", hint: "Masukkan email Anda untuk membuka survey." },
  { n: "02", label: "ISI SURVEY", hint: "Jawab pertanyaan berikut sejujurnya." },
  { n: "03", label: "SELESAI", hint: "Jawaban Anda tersimpan. Terima kasih!" },
];

const stepIndex = (s: Step) => (s === "form" ? 1 : s === "done" ? 2 : 0);

export default function PublicSurveyPage() {
  return (
    <Suspense fallback={null}>
      <PublicSurveyContent />
    </Suspense>
  );
}

function PublicSurveyContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const referralCode = search.get("ref") ?? "";
  const surveyId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [step, setStep] = useState<Step>("email");
  const [survey, setSurvey] = useState<SurveyMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [customer, setCustomer] = useState<CustomerMeta | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerPatch>>({});

  const brand: Brand = { companyName, logoUrl: null, instagram: null };

  const onValidateEmail = async () => {
    if (!email) return;
    if (!referralCode) { setError("Kode referral (ref) wajib ada pada URL."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/survey/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, referralCode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.reason ?? data?.error ?? "Email tidak valid.");

      setCustomer(data.customer);
      setCompanyName(data.company?.name ?? null);
      if (!surveyId) throw new Error("Survey id tidak valid.");

      const qsRes = await fetch(`/api/survey/${surveyId}/questions?ref=${encodeURIComponent(referralCode)}`);
      const qsData = await qsRes.json().catch(() => null);
      if (!qsRes.ok) throw new Error(qsData?.error ?? "Gagal memuat pertanyaan.");

      setSurvey(qsData.survey);
      setQuestions(qsData.questions ?? []);
      setStep("form");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  const requiredUnfilled = useMemo(() => {
    if (step !== "form") return 0;
    return questions.filter((q) => q.is_required).filter((q) => {
      const a = answers[q.id];
      if (!a) return true;
      if (a.selectedOptions?.length) return false;
      if (a.answerText?.trim()) return false;
      if (a.answerValue !== undefined && a.answerValue !== null && String(a.answerValue).length > 0) return false;
      return true;
    }).length;
  }, [answers, questions, step]);

  const onSubmitSurvey = async () => {
    if (!customer || !referralCode || !surveyId) return;
    if (requiredUnfilled > 0) { setError("Masih ada pertanyaan wajib yang belum diisi."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = Object.entries(answers).map(([questionId, v]) => ({
        questionId,
        answerText: v.answerText ?? null,
        answerValue: v.answerValue ?? null,
        selectedOptions: v.selectedOptions ?? null,
      }));

      const res = await fetch(`/api/survey/${surveyId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerGuid: customer.guid, referralCode, answers: payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Gagal mengirim survey.");

      setStep("done");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell brand={brand} tag="SURVEY" kicker="Portal Survey Peserta" steps={STEPS} currentStep={stepIndex(step)}>
      {step === "email" && (
        <>
          <Heading title="Buka Survey" subtitle="Masukkan email Anda untuk memulai." />
          <form onSubmit={(e) => { e.preventDefault(); onValidateEmail(); }} className="space-y-5">
            <div>
              <Label>Alamat E-Mail</Label>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contoh: juragan@umkm.com"
                autoComplete="email"
              />
            </div>
            <PrimaryButton type="submit" disabled={loading || !email || !referralCode}>
              {loading ? "Memeriksa..." : "Mulai Survey →"}
            </PrimaryButton>
            <ErrorText>{error}</ErrorText>
          </form>
          <Divider />
          <NoteBox>
            Email dipakai untuk mencocokkan jawaban Anda dengan data peserta program. Jawaban Anda tidak dipublikasikan.
          </NoteBox>
        </>
      )}

      {step === "form" && (
        <>
          <Heading title={survey?.title ?? "Survey"} subtitle={survey?.description ?? undefined} />
          <div className="mb-6 border-2 px-4 py-2.5 text-xs" style={{ borderColor: LINE, color: INK_SOFT }}>
            Diisi sebagai <strong style={{ color: INK }}>{customer?.full_name || customer?.email || email}</strong>
          </div>

          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                index={i}
                question={q}
                value={answers[q.id]}
                onChange={(patch) => setAnswers((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] ?? {}), ...patch } }))}
              />
            ))}
          </div>

          <div className="mt-7 space-y-3">
            {requiredUnfilled > 0 && (
              <p className="text-xs font-bold" style={{ color: MUTED }}>
                {requiredUnfilled} pertanyaan wajib belum diisi.
              </p>
            )}
            <PrimaryButton onClick={onSubmitSurvey} disabled={submitting || requiredUnfilled > 0}>
              {submitting ? "Mengirim..." : "Kirim Survey →"}
            </PrimaryButton>
            <ErrorText>{error}</ErrorText>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <Heading title="Terima Kasih!" />
          <Callout tone="ok" title="Jawaban tersimpan">
            Survey <strong style={{ color: INK }}>{survey?.title}</strong> sudah terkirim. Silakan tutup halaman ini.
          </Callout>
        </>
      )}
    </Shell>
  );
}
