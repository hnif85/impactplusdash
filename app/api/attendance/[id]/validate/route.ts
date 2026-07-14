import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEvent, getCompanyRef, findCustomerByEmailAndRef, hasSurveyCompleted, hasAttended } from "@/lib/attendance";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

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

    const already = await hasAttended(eventId, email);
    if (already) {
      return NextResponse.json({
        status: "already_attended",
        customer: { guid: customer.guid, full_name: customer.full_name, email: customer.email },
        referral_code: company.referral_code,
      });
    }

    // Check program-level pre-survey first
    if (company.program_pre_survey_id) {
      const progDone = await hasSurveyCompleted(company.program_pre_survey_id, customer.guid);
      if (!progDone) {
        return NextResponse.json({
          status: "needs_survey",
          survey_id: company.program_pre_survey_id,
          survey_type: "program_pre",
          customer: { guid: customer.guid, full_name: customer.full_name, email: customer.email },
          referral_code: company.referral_code,
        });
      }
    }

    // Then check event-level pre-quiz
    if (event.survey_id) {
      const eventDone = await hasSurveyCompleted(event.survey_id, customer.guid);
      if (!eventDone) {
        return NextResponse.json({
          status: "needs_survey",
          survey_id: event.survey_id,
          survey_type: "event_pre",
          customer: { guid: customer.guid, full_name: customer.full_name, email: customer.email },
          referral_code: company.referral_code,
        });
      }
    }

    return NextResponse.json({
      status: "needs_attendance",
      customer: { guid: customer.guid, full_name: customer.full_name, email: customer.email },
      referral_code: company.referral_code,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad Request", issues: err.flatten() }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
