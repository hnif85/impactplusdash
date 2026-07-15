import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getEvent, getCompanyRef, findCustomerByEmailAndRef, pendingPreSurveys,
  attendedDates, hasAttendedOn, localToday, eventDays,
} from "@/lib/attendance";
import { isUuid } from "@/lib/uuid";


const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }

    const body = await req.json();
    const { email } = schema.parse(body);

    const event = await getEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    if (!event.is_active) return NextResponse.json({ error: "Event tidak aktif." }, { status: 400 });

    const company = await getCompanyRef(event.company_id);
    if (!company || !company.referral_code) {
      return NextResponse.json({ error: "Perusahaan event tidak valid." }, { status: 500 });
    }

    const customer = await findCustomerByEmailAndRef(email, company.referral_code);
    if (!customer) {
      return NextResponse.json({ status: "unregistered", referral_code: company.referral_code });
    }

    // Multi-day: attendance is per day, surveys stay once per participant.
    const today = localToday(company.timezone);
    const days = eventDays(event);
    const dayIndex = days.indexOf(today);
    const dayInfo = {
      today,
      total_days: days.length,
      day_number: dayIndex >= 0 ? dayIndex + 1 : null,
      attended_days: await attendedDates(eventId, email),
    };

    if (await hasAttendedOn(eventId, email, today)) {
      return NextResponse.json({
        status: "already_attended",
        customer: { guid: customer.guid, full_name: customer.full_name, email: customer.email },
        referral_code: company.referral_code,
        ...dayInfo,
      });
    }

    const cust = { guid: customer.guid, full_name: customer.full_name, email: customer.email };
    const pending = await pendingPreSurveys(event, company, customer.guid);

    // Both pre-surveys are required before attendance; report how many remain so
    // the participant can see there is more than one step.
    if (pending.length > 0) {
      return NextResponse.json({
        status: "needs_survey",
        survey_id: pending[0].id,
        survey_type: pending[0].kind,
        pending_surveys: pending.length,
        customer: cust,
        referral_code: company.referral_code,
        ...dayInfo,
      });
    }

    return NextResponse.json({
      status: "needs_attendance",
      pending_surveys: 0,
      customer: cust,
      referral_code: company.referral_code,
      ...dayInfo,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad Request", issues: err.flatten() }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
