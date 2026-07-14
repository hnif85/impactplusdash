"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Shell, Heading, Label, TextInput, PrimaryButton, GhostButton, Divider,
  NoteBox, Callout, ErrorText, INK, INK_SOFT, ORANGE, MUTED, LINE,
  type Brand,
} from "@/components/participant/Shell";
import { QuestionCard, type Question, type AnswerPatch } from "@/components/participant/QuestionInput";

type Customer = { guid: string; full_name: string; email: string };
type Step = "email" | "unregistered" | "survey" | "confirm" | "done";

const STEPS = [
  { n: "01", label: "VERIFIKASI", hint: "Masukkan email Anda untuk absensi kehadiran." },
  { n: "02", label: "SURVEY", hint: "Isi survey wajib sebelum kehadiran dicatat." },
  { n: "03", label: "HADIR", hint: "Konfirmasi kehadiran Anda di event ini." },
];

const stepIndex = (s: Step) => (s === "survey" ? 1 : s === "confirm" || s === "done" ? 2 : 0);

export default function AttendancePage() {
  const params = useParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [surveyKind, setSurveyKind] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [day, setDay] = useState<{ day_number: number | null; total_days: number; attended_days: string[]; today: string }>({
    day_number: null, total_days: 1, attended_days: [], today: "",
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [surveyMeta, setSurveyMeta] = useState<{ title: string; description: string | null } | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerPatch>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [brand, setBrand] = useState<Brand>({ companyName: null, logoUrl: null, instagram: null });

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/attendance/${eventId}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEventName(d.name ?? "");
        setBrand({
          companyName: d.company?.name ?? null,
          logoUrl: d.company?.logo_url ?? null,
          instagram: d.company?.instagram ?? null,
        });
      })
      .catch(() => {});
  }, [eventId]);

  const doValidate = useCallback(async (targetEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/${eventId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Gagal memverifikasi email.");

      setCustomer(data.customer ?? null);
      setPendingCount(data.pending_surveys ?? 0);
      setDay({
        day_number: data.day_number ?? null,
        total_days: data.total_days ?? 1,
        attended_days: data.attended_days ?? [],
        today: data.today ?? "",
      });

      if (data.status === "unregistered") { setStep("unregistered"); return; }
      if (data.status === "already_attended") { setStep("done"); return; }

      if (data.status === "needs_survey") {
        setSurveyId(data.survey_id);
        setSurveyKind(data.survey_type ?? null);
        setAnswers({});
        setQuestions([]);
        const qsRes = await fetch(
          `/api/survey/${data.survey_id}/questions?ref=${encodeURIComponent(data.referral_code)}`
        );
        if (!qsRes.ok) throw new Error("Gagal memuat pertanyaan survey.");
        const qsData = await qsRes.json();
        setQuestions(qsData.questions ?? []);
        setSurveyMeta(qsData.survey ?? null);
        setStep("survey");
        window.scrollTo({ top: 0 });
        return;
      }

      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const requiredUnfilled = useMemo(() => {
    if (step !== "survey") return 0;
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
    if (!customer || !surveyId) return;
    if (requiredUnfilled > 0) { setError("Masih ada pertanyaan wajib yang belum diisi."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const surveyAnswers = Object.entries(answers).map(([questionId, v]) => ({
        questionId,
        answerText: v.answerText ?? null,
        answerValue: v.answerValue ?? null,
        selectedOptions: v.selectedOptions ?? null,
      }));

      const res = await fetch(`/api/attendance/${eventId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "survey", email, customerGuid: customer.guid, surveyId, surveyAnswers }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Gagal menyimpan survey.");

      // Re-validate: there may be a second required survey before attendance.
      await doValidate(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirmAttendance = async () => {
    if (!customer) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance/${eventId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attend", email, customerGuid: customer.guid }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // The server refuses attendance while a pre-survey is outstanding.
        if (res.status === 409) { await doValidate(email); return; }
        throw new Error(data?.error ?? "Gagal mencatat absensi.");
      }
      setStep("done");
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  };

  const DayBadge = ({ day: d }: { day: typeof day }) => {
    if (d.total_days <= 1) return null;
    return (
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {Array.from({ length: d.total_days }, (_, i) => i + 1).map((n) => {
          const isNow = d.day_number === n;
          const done = d.attended_days.length >= n && !isNow;
          return (
            <span
              key={n}
              className="border-2 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide"
              style={{
                borderColor: INK,
                background: isNow ? ORANGE : done ? INK : "transparent",
                color: done ? "#FFF" : INK,
                opacity: isNow || done ? 1 : 0.4,
              }}
            >
              Hari {n}{done ? " ✓" : ""}
            </span>
          );
        })}
        {d.day_number === null && (
          <span className="text-[11px] font-bold" style={{ color: MUTED }}>
            (hari ini di luar jadwal event)
          </span>
        )}
      </div>
    );
  };

  const kindLabel = surveyKind === "program_pre"
    ? "Survey Program (Pre)"
    : surveyKind === "event_pre"
      ? "Survey Event (Pre)"
      : "Survey";

  return (
    <Shell brand={brand} tag="ABSENSI" kicker="Portal Pendaftaran & Kehadiran Peserta" steps={STEPS} currentStep={stepIndex(step)}>
      {step === "email" && (
        <>
          <Heading title="Cek Pendaftaran" subtitle="Masukkan email Anda untuk absensi." />
          <form onSubmit={(e) => { e.preventDefault(); if (email) doValidate(email); }} className="space-y-5">
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
            <PrimaryButton type="submit" disabled={loading || !email}>
              {loading ? "Memeriksa..." : "Cek Status →"}
            </PrimaryButton>
            <ErrorText>{error}</ErrorText>
          </form>
          <Divider />
          <NoteBox>
            Sistem akan mendeteksi secara otomatis apakah data Anda sudah lengkap atau perlu dilakukan pendaftaran ulang.
          </NoteBox>
        </>
      )}

      {step === "unregistered" && (
        <>
          <Heading title="Belum Terdaftar" />
          <Callout title="Email tidak ditemukan">
            Email <strong style={{ color: INK }}>{email}</strong> tidak ada dalam daftar peserta event ini.
            Pastikan Anda memakai email yang sama seperti saat mendaftar program.
          </Callout>
          <div className="mt-6">
            <GhostButton onClick={() => { setStep("email"); setError(null); }}>← Coba Email Lain</GhostButton>
          </div>
        </>
      )}

      {step === "survey" && (
        <>
          <Heading title={kindLabel} subtitle={surveyMeta?.title ?? undefined} />

          {pendingCount > 1 && (
            <div className="mb-6 border-2 px-4 py-2.5 text-xs font-bold" style={{ borderColor: ORANGE, color: INK }}>
              Ada <span style={{ color: ORANGE }}>{pendingCount} survey</span> yang harus diisi sebelum absensi. Ini yang pertama.
            </div>
          )}

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
              {submitting ? "Menyimpan..." : "Kirim Survey →"}
            </PrimaryButton>
            <ErrorText>{error}</ErrorText>
          </div>
        </>
      )}

      {step === "confirm" && (
        <>
          <Heading title="Konfirmasi Hadir" subtitle={eventName} />
          <DayBadge day={day} />
          <div className="border-2 p-6" style={{ borderColor: INK, boxShadow: `6px 6px 0 ${LINE}` }}>
            <p className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>Peserta</p>
            <p className="mt-1 text-xl font-extrabold" style={{ color: INK }}>{customer?.full_name || email}</p>
            <p className="text-sm" style={{ color: INK_SOFT }}>{email}</p>
            <p className="mt-4 text-sm" style={{ color: INK_SOFT }}>
              {day.attended_days.length > 0
                ? "Survey wajib sudah lengkap dan tidak perlu diisi lagi. Tekan tombol di bawah untuk absen hari ini."
                : "Survey wajib sudah lengkap. Tekan tombol di bawah untuk mencatat kehadiran Anda."}
            </p>
          </div>
          <div className="mt-6 space-y-3">
            <PrimaryButton onClick={onConfirmAttendance} disabled={submitting}>
              {submitting ? "Memproses..." : "Saya Hadir ✓"}
            </PrimaryButton>
            <ErrorText>{error}</ErrorText>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <Heading title="Terima Kasih!" />
          <Callout tone="ok" title="Kehadiran tercatat">
            Absensi Anda untuk <strong style={{ color: INK }}>{eventName}</strong>
            {day.day_number ? <> <strong style={{ color: INK }}>hari ke-{day.day_number}</strong></> : null} sudah tersimpan.
            {day.total_days > 1 && day.day_number !== null && day.day_number < day.total_days && (
              <> Jangan lupa absen lagi besok — <strong style={{ color: INK }}>survey tidak perlu diisi ulang</strong>.</>
            )}
          </Callout>
          <Divider />
          <NoteBox icon="!">
            Survey setelah event (post) dibagikan lewat link terpisah. Anda perlu memasukkan email lagi di sana.
          </NoteBox>
        </>
      )}
    </Shell>
  );
}
