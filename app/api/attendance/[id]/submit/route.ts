import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEvent, getCompanyRef, findCustomerByEmailAndRef, hasSurveyCompleted, hasAttended, submitAttendance, updateAttendanceSurveyFlag, submitSurveyForCustomer } from "@/lib/attendance";
import { fetchQuestions } from "@/lib/surveyPublic";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

const answerSchema = z.object({
  questionId: z.string().min(1),
  answerText: z.string().optional().nullable(),
  answerValue: z.union([z.string(), z.number()]).optional().nullable(),
  selectedOptions: z.array(z.string()).optional().nullable(),
});

const schema = z.object({
  email: z.string().email(),
  customerGuid: z.string().min(1),
  surveyId: z.string().optional(),
  surveyAnswers: z.array(answerSchema).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }

    const body = await req.json();
    const { email, customerGuid, surveyId, surveyAnswers } = schema.parse(body);

    const event = await getEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    if (!event.is_active) return NextResponse.json({ error: "Event tidak aktif." }, { status: 400 });

    const company = await getCompanyRef(event.company_id);
    if (!company || !company.referral_code) {
      return NextResponse.json({ error: "Perusahaan event tidak valid." }, { status: 500 });
    }

    const customer = await findCustomerByEmailAndRef(email, company.referral_code);
    if (!customer) {
      return NextResponse.json({ error: "Email tidak terdaftar." }, { status: 400 });
    }

    const already = await hasAttended(eventId, email);
    if (already) {
      return NextResponse.json({ success: true, message: "Anda sudah melakukan absensi." });
    }

    if (surveyId && surveyAnswers && surveyAnswers.length > 0) {
      const done = await hasSurveyCompleted(surveyId, customerGuid);
      if (!done) {
        const questions = await fetchQuestions(surveyId);
        const allowedIds = new Set(questions.map((q) => q.id as string));
        const filtered = surveyAnswers.filter((a) => allowedIds.has(a.questionId));

        if (filtered.length > 0) {
          await submitSurveyForCustomer({
            surveyId,
            customerGuid,
            answers: filtered,
          });
        }
      }
    }

    await submitAttendance(eventId, email, customerGuid, customer.full_name ?? "");

    if (surveyId) {
      await updateAttendanceSurveyFlag(eventId, email);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad Request", issues: err.flatten() }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
