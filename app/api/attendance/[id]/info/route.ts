import { NextResponse } from "next/server";
import { getEvent } from "@/lib/attendance";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }
    const event = await getEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ name: event.name, event_date: event.event_date, location: event.location });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
