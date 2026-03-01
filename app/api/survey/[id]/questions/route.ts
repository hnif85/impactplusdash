import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSurveyActive, fetchQuestions, getCompanyByReferralCode } from "@/lib/surveyPublic";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

const querySchema = z.object({
  ref: z.string().min(1, "referral code required"),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const surveyId = params?.id;
    if (!surveyId || !isUuid(surveyId)) {
      return NextResponse.json({ error: "Survey id invalid." }, { status: 400 });
    }

    const search = new URL(req.url).searchParams;
    const parseResult = querySchema.safeParse({ ref: search.get("ref") });
    if (!parseResult.success) {
      return NextResponse.json({ error: "Bad Request", issues: parseResult.error.flatten() }, { status: 400 });
    }

    const referralCode = parseResult.data.ref;
    const company = await getCompanyByReferralCode(referralCode);
    if (!company) {
      return NextResponse.json({ error: "Referral code tidak dikenali." }, { status: 404 });
    }

    const survey = await ensureSurveyActive(surveyId);
    if (!survey) {
      return NextResponse.json({ error: "Survey tidak aktif atau sudah berakhir." }, { status: 404 });
    }

    const questions = await fetchQuestions(surveyId);

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
      },
      questions,
      company: { id: company.id, name: company.name },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
