"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type EventItem = {
  id: string;
  name: string;
  event_date: string | null;
  location: string | null;
  event_type: string | null;
  is_active: boolean;
  created_at: string;
};

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = window.localStorage.getItem("ip_token");
    if (!t) { router.replace("/login"); return; }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/events", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { throw new Error("Gagal memuat event."); }
        const data = await res.json();
        setEvents(data.events ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      } finally { setLoading(false); }
    };
    load();
  }, [token]);

  const toggleActive = async (eventId: string, current: boolean) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !current }),
      });
      if (!res.ok) throw new Error("Gagal update status.");
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, is_active: !current } : e)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Event</p>
          <h2 className="text-xl font-semibold">Kelola Event</h2>
        </div>
        <Link
          href="/dashboard/events/create"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400"
        >
          + Buat Event
        </Link>
      </div>

      {loading && <p className="text-sm text-zinc-400">Memuat event...</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 text-sm text-zinc-400">
          Belum ada event. Klik tombol &quot;Buat Event&quot; untuk membuat event baru.
        </div>
      )}

      <div className="grid gap-4">
        {events.map((ev) => (
          <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-white">{ev.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ev.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/20 text-zinc-400"}`}>
                    {ev.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                  {ev.event_date && <span>{ev.event_date}</span>}
                  {ev.location && <span>{ev.location}</span>}
                  {ev.event_type && <span>{ev.event_type}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/events/${ev.id}`}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Lihat Absensi
                </Link>
                <button
                  onClick={() => toggleActive(ev.id, ev.is_active)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  {ev.is_active ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
