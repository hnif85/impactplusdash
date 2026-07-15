import { NextResponse } from "next/server";
import { getEvent, getCompanyRef } from "@/lib/attendance";
import { isUuid } from "@/lib/uuid";


export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }
    const event = await getEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });

    // Branding comes from the company, so a BRI event never wears another
    // client's name.
    const company = await getCompanyRef(event.company_id);

    return NextResponse.json({
      name: event.name,
      event_date: event.event_date,
      location: event.location,
      is_active: event.is_active,
      company: company
        ? { name: company.name, logo_url: company.logo_url, instagram: company.instagram }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
