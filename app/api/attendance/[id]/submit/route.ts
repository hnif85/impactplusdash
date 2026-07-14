import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getEvent, getCompanyRef, findCustomerByEmailAndRef, hasSurveyCompleted,
  hasAttendedOn, submitAttendance, submitSurveyForCustomer, pendingPreSurveys,
  localToday,
} from "@/lib/attendance";
import { fetchQuestions } from "@/lib/surveyPublic";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

const answerSchema = z.object({
  questionId: z.string().min(1),
  answerText: z.string().optional().nullable(),
  answerValue: z.union([z.string(), z.number()]).optional().nullable(),
  selectedOptions: z.array(z.string()).optional().nullable(),
});

/**
 * The action is explicit rather than inferred from the presence of surveyId.
 * Inferring it is what let a survey submission silently record attendance,
 * which then short-circuited every remaining pre-survey.
 */
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("survey"),
    email: z.string().email(),
    customerGuid: z.string().min(1),
    surveyId: z.string().min(1),
    surveyAnswers: z.array(answerSchema).min(1),
  }),
  z.object({
    action: z.literal("attend"),
    email: z.string().email(),
    customerGuid: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }

    const body = schema.parse(await req.json());

    const event = await getEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    if (!event.is_active) return NextResponse.json({ error: "Event tidak aktif." }, { status: 400 });

    const company = await getCompanyRef(event.company_id);
    if (!company || !company.referral_code) {
      return NextResponse.json({ error: "Perusahaan event tidak valid." }, { status: 500 });
    }

    const customer = await findCustomerByEmailAndRef(body.email, company.referral_code);
    if (!customer) return NextResponse.json({ error: "Email tidak terdaftar." }, { status: 400 });
    if (customer.guid !== body.customerGuid) {
      return NextResponse.json({ error: "Data peserta tidak cocok." }, { status: 400 });
    }

    // Attendance is per day; a second day is a new check-in, not a duplicate.
    const today = localToday(company.timezone);
    if (await hasAttendedOn(eventId, body.email, today)) {
      return NextResponse.json({ success: true, message: "Anda sudah absen hari ini.", attendance_date: today });
    }

    if (body.action === "survey") {
      // Only the surveys this event actually requires - never an arbitrary id.
      const allowed = [company.program_pre_survey_id, event.survey_id].filter(Boolean);
      if (!allowed.includes(body.surveyId)) {
        return NextResponse.json({ error: "Survey tidak berlaku untuk event ini." }, { status: 400 });
      }

      if (await hasSurveyCompleted(body.surveyId, body.customerGuid)) {
        return NextResponse.json({ success: true, message: "Survey sudah pernah diisi." });
      }

      const questions = await fetchQuestions(body.surveyId);
      const allowedIds = new Set(questions.map((q) => q.id as string));
      const filtered = body.surveyAnswers.filter((a) => allowedIds.has(a.questionId));
      if (filtered.length === 0) {
        return NextResponse.json({ error: "Tidak ada jawaban yang valid." }, { status: 400 });
      }

      await submitSurveyForCustomer({
        surveyId: body.surveyId,
        customerGuid: body.customerGuid,
        answers: filtered,
      });

      // Attendance is deliberately NOT recorded here.
      const pending = await pendingPreSurveys(event, company, body.customerGuid);
      return NextResponse.json({ success: true, pending_surveys: pending.length });
    }

    // action === "attend": the server decides, so a crafted request cannot skip
    // a survey the UI would have forced.
    const pending = await pendingPreSurveys(event, company, body.customerGuid);
    if (pending.length > 0) {
      return NextResponse.json(
        { error: "Masih ada survey wajib yang belum diisi.", pending_surveys: pending.length },
        { status: 409 }
      );
    }

    await submitAttendance(eventId, body.email, body.customerGuid, customer.full_name ?? "", true, today);
    return NextResponse.json({ success: true, attendance_date: today });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return NextResponse.json(
        { error: first ? `${first.path.join(".")}: ${first.message}` : "Bad Request", issues: err.flatten() },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
