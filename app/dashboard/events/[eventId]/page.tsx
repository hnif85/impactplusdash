"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Attendance = {
  id: string;
  email: string;
  full_name: string;
  survey_submitted: boolean;
  attended_at: string;
};

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [eventName, setEventName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        if (!res.ok) throw new Error("Gagal memuat data absensi.");
        const data = await res.json();
        setAttendance(data.attendance ?? []);
        setEventName(data.event_name ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      } finally { setLoading(false); }
    };
    load();
  }, [token, eventId]);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/attendance/${eventId}`
    : "";

  const onCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Absensi</p>
          <h2 className="text-xl font-semibold">{eventName || "Detail Event"}</h2>
        </div>
        <button
          onClick={() => router.push("/dashboard/events")}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          Kembali
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Link Absensi Publik</p>
        <div className="flex items-center gap-2">
          <input value={shareUrl} readOnly className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white" />
          <button onClick={onCopy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400">
            {copied ? "Tersalin!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-2xl font-bold text-emerald-400">{attendance.length}</p>
          <p className="text-xs text-zinc-400">Total Hadir</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-2xl font-bold text-emerald-400">{attendance.filter((a) => a.survey_submitted).length}</p>
          <p className="text-xs text-zinc-400">Survey Terisi</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-2xl font-bold text-zinc-400">{attendance.filter((a) => !a.survey_submitted).length}</p>
          <p className="text-xs text-zinc-400">Tanpa Survey</p>
        </div>
      </div>

      {loading && <p className="text-sm text-zinc-400">Memuat data absensi...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && attendance.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-sm text-zinc-400">
          Belum ada peserta yang melakukan absensi.
        </div>
      )}

      {attendance.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Survey</th>
                <th className="px-4 py-3">Waktu Absen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {attendance.map((a) => (
                <tr key={a.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-white">{a.full_name || "-"}</td>
                  <td className="px-4 py-3 text-zinc-300">{a.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${a.survey_submitted ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                      {a.survey_submitted ? "Ya" : "Tidak"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{new Date(a.attended_at).toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
