"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Survey = { id: string; title: string };

export default function CreateEventPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  // training_events.event_type is constrained to online/offline - it records the
  // event's mode, not its category.
  const [eventType, setEventType] = useState("offline");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [surveyId, setSurveyId] = useState("");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.localStorage.getItem("ip_token");
    if (!t) { router.replace("/login"); return; }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/surveys", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSurveys(d.surveys ?? []))
      .catch(() => {});
  }, [token]);

  const onSubmit = async () => {
    if (!name.trim() || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          event_date: eventDate || undefined,
          location: location || undefined,
          event_type: eventType,
          description: description || undefined,
          max_participants: maxParticipants ? Number(maxParticipants) : undefined,
          survey_id: surveyId || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal membuat event.");
      }
      router.push("/dashboard/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Event</p>
        <h2 className="text-xl font-semibold">Buat Event Baru</h2>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <Field label="Nama Event *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama event" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
        </Field>

        <Field label="Tanggal Event">
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
        </Field>

        <Field label="Lokasi">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lokasi event" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
        </Field>

        <Field label="Tipe Event">
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400">
            <option value="offline">Offline (luring)</option>
            <option value="online">Online (daring)</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">Moda pelaksanaan event.</p>
        </Field>

        <Field label="Deskripsi">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi event" rows={3} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
        </Field>

        <Field label="Maksimal Peserta">
          <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="Kosongi jika tidak terbatas" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
        </Field>

        <Field label="Survey (opsional)">
          <select value={surveyId} onChange={(e) => setSurveyId(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400">
            <option value="">Tidak ada survey</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">Pilih survey yang akan diisi peserta saat absensi.</p>
        </Field>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={() => router.back()} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
            Batal
          </button>
          <button onClick={onSubmit} disabled={submitting || !name.trim()} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? "Menyimpan..." : "Simpan Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.1em] text-zinc-400">{label}</label>
      {children}
    </div>
  );
}
