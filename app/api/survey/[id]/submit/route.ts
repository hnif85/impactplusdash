import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureSurveyActive,
  fetchQuestions,
  findCustomerByGuidAndRef,
  getCompanyByReferralCode,
  hasCustomerSubmitted,
  insertAnswers,
  insertResponse,
} from "@/lib/surveyPublic";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

const answerSchema = z.object({
  questionId: z.string().min(1),
  answerText: z.string().optional().nullable(),
  answerValue: z.union([z.string(), z.number()]).optional().nullable(),
  selectedOptions: z.array(z.string()).optional().nullable(),
});

const bodySchema = z.object({
  customerGuid: z.string().min(1),
  referralCode: z.string().min(1),
  answers: z.array(answerSchema).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const json = await req.json();
    const { customerGuid, referralCode, answers } = bodySchema.parse(json);

    const { id: surveyId } = await params;
    if (!surveyId || !isUuid(surveyId)) {
      return NextResponse.json({ error: "Survey id invalid." }, { status: 400 });
    }

    const [company, survey, customer] = await Promise.all([
      getCompanyByReferralCode(referralCode),
      ensureSurveyActive(surveyId),
      findCustomerByGuidAndRef(customerGuid, referralCode),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Referral code tidak dikenali." }, { status: 404 });
    }
    if (!survey) {
      return NextResponse.json({ error: "Survey tidak aktif atau sudah berakhir." }, { status: 404 });
    }
    if (!customer) {
      return NextResponse.json({ error: "Customer tidak valid untuk referral ini." }, { status: 400 });
    }

    const duplicate = await hasCustomerSubmitted(surveyId, customerGuid);
    if (duplicate) {
      return NextResponse.json({ error: "Anda sudah mengisi survey ini." }, { status: 409 });
    }

    // Optional: filter answers to only known questions of this survey
    const questions = await fetchQuestions(surveyId);
    const allowedIds = new Set(questions.map((q) => q.id as string));
    const filteredAnswers = answers.filter((a) => allowedIds.has(a.questionId));

    if (filteredAnswers.length === 0) {
      return NextResponse.json({ error: "Tidak ada jawaban yang valid." }, { status: 400 });
    }

    const responseId = await insertResponse({
      surveyId,
      companyId: company?.id ?? null,
      customerGuid,
      completionTimeSeconds: null,
    });

    await insertAnswers(responseId, filteredAnswers);

    return NextResponse.json({ success: true, responseId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad Request", issues: err.flatten() }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
