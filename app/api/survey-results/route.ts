import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAuthUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; role: string; company_id: string | null }; }
  catch { return null; }
}

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const referralCode = req.nextUrl.searchParams.get("referral_code") || "";

    // Get company from referral code or user's company_id
    let companyId = user.company_id;
    if (referralCode) {
      const { data: company } = await supabase
        .from("companies")
        .select("id, metadata")
        .eq("metadata->>referral_code", referralCode)
        .maybeSingle();
      if (company) companyId = company.id;
    }

    if (!companyId) return NextResponse.json({ error: "Company not found." }, { status: 404 });

    // Collect all survey IDs for this company
    const surveyIds: string[] = [];

    // From company metadata
    const { data: company } = await supabase
      .from("companies")
      .select("metadata")
      .eq("id", companyId)
      .maybeSingle();

    const meta = company?.metadata as Record<string, unknown> | null;
    if (meta?.program_pre_survey_id) surveyIds.push(meta.program_pre_survey_id as string);
    if (meta?.program_post_survey_id) surveyIds.push(meta.program_post_survey_id as string);

    // From training events
    const { data: events } = await supabase
      .from("training_events")
      .select("survey_id")
      .eq("company_id", companyId)
      .not("survey_id", "is", null);

    if (events) {
      for (const ev of events) {
        if (ev.survey_id && !surveyIds.includes(ev.survey_id)) {
          surveyIds.push(ev.survey_id);
        }
      }
    }

    if (surveyIds.length === 0) {
      return NextResponse.json({ surveys: [] });
    }

    // Get survey metadata
    const { data: surveys } = await supabase
      .from("surveys")
      .select("id, title, description, survey_type")
      .in("id", surveyIds);

    // Get questions for all surveys
    const { data: questions } = await supabase
      .from("survey_questions")
      .select("id, survey_id, question_text, question_type, options, correct_answer, order_index")
      .in("survey_id", surveyIds)
      .order("order_index", { ascending: true });

    // Get all responses for these surveys by this company's customers
    const { data: companyData } = await supabase
      .from("companies")
      .select("metadata->>referral_code as ref")
      .eq("id", companyId)
      .maybeSingle();

    const refCode = (companyData as any)?.ref || referralCode;
    let customerGuids: string[] = [];

    if (refCode) {
      const { data: customers } = await supabase
        .from("cms_customers")
        .select("guid")
        .eq("referal_code", refCode);
      customerGuids = (customers ?? []).map((c: any) => c.guid).filter(Boolean);
    }

    const { data: allResponses } = await supabase
      .from("survey_responses")
      .select("id, survey_id, customer_guid")
      .in("survey_id", surveyIds);

    const responseIds = (allResponses ?? []).map((r: any) => r.id);
    const responseMap: Record<string, { survey_id: string; response_ids: string[] }> = {};
    for (const r of allResponses ?? []) {
      if (!responseMap[r.survey_id]) responseMap[r.survey_id] = { survey_id: r.survey_id, response_ids: [] };
      responseMap[r.survey_id].response_ids.push(r.id);
    }

    // Get answers
    const { data: allAnswers } = await supabase
      .from("survey_answers")
      .select("response_id, question_id, answer_text, answer_value, selected_options")
      .in("response_id", responseIds);

    // Build per-question breakdown
    const questionsBySurvey: Record<string, any[]> = {};
    for (const q of questions ?? []) {
      if (!questionsBySurvey[q.survey_id]) questionsBySurvey[q.survey_id] = [];
      questionsBySurvey[q.survey_id].push(q);
    }

    const answerForQ: Record<string, any[]> = {};
    for (const a of allAnswers ?? []) {
      if (!answerForQ[a.question_id]) answerForQ[a.question_id] = [];
      answerForQ[a.question_id].push(a);
    }

    const result = (surveys ?? []).map((s: any) => {
      const qs = questionsBySurvey[s.id] ?? [];
      const totalResp = responseMap[s.id]?.response_ids?.length ?? 0;

      const questionResults = qs.map((q: any) => {
        const ans = answerForQ[q.id] ?? [];
        const opts = (q.options as string[]) ?? [];

        if (q.question_type === "multiple_choice" || q.question_type === "dropdown" || q.question_type === "yes_no") {
          const counts: Record<string, number> = {};
          for (const o of opts) counts[o] = 0;
          let otherCount = 0;
          for (const a of ans) {
            const val = a.answer_text || a.answer_value || (a.selected_options?.[0]) || "";
            if (counts[val] !== undefined) counts[val]++;
            else otherCount++;
          }
          const total = ans.length || 1;
          const breakdown = opts.map((o: string) => ({
            label: o,
            count: counts[o] ?? 0,
            pct: Math.round(((counts[o] ?? 0) / total) * 100),
            isCorrect: q.correct_answer ? o === q.correct_answer : null,
          }));
          if (otherCount > 0) breakdown.push({ label: "Lainnya", count: otherCount, pct: Math.round((otherCount / total) * 100), isCorrect: null });

          return {
            id: q.id,
            order_index: q.order_index,
            text: q.question_text,
            type: q.question_type,
            correct_answer: q.correct_answer ?? null,
            breakdown,
            total_answers: ans.length,
          };
        }

        if (q.question_type === "checkbox") {
          const counts: Record<string, number> = {};
          for (const o of opts) counts[o] = 0;
          for (const a of ans) {
            const sel = Array.isArray(a.selected_options) ? a.selected_options : [];
            for (const s of sel) { if (counts[s] !== undefined) counts[s]++; }
          }
          const total = ans.length || 1;
          const breakdown = opts.map((o: string) => ({
            label: o,
            count: counts[o] ?? 0,
            pct: Math.round(((counts[o] ?? 0) / total) * 100),
            isCorrect: null,
          }));
          return {
            id: q.id, order_index: q.order_index, text: q.question_text, type: q.question_type,
            correct_answer: null, breakdown, total_answers: ans.length,
          };
        }

        if (q.question_type === "rating" || q.question_type === "nps") {
          const vals = ans.map((a: any) => Number(a.answer_value ?? 0)).filter((v: number) => v > 0);
          const avg = vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
          const dist: Record<string, number> = {};
          for (const v of vals) { const k = String(v); dist[k] = (dist[k] ?? 0) + 1; }
          return {
            id: q.id, order_index: q.order_index, text: q.question_text, type: q.question_type,
            correct_answer: null, average: Math.round(avg * 10) / 10,
            distribution: Object.entries(dist).sort(([a], [b]) => Number(a) - Number(b)).map(([label, count]) => ({ label, count })),
            total_answers: vals.length,
          };
        }

        // text
        const textAnswers = ans.map((a: any) => a.answer_text ?? "").filter(Boolean);
        return {
          id: q.id, order_index: q.order_index, text: q.question_text, type: q.question_type,
          correct_answer: null, answers: textAnswers, total_answers: textAnswers.length,
        };
      });

      return {
        id: s.id,
        title: s.title,
        description: s.description,
        type: s.survey_type,
        total_respondents: totalResp,
        questions: questionResults,
      };
    });

    return NextResponse.json({ surveys: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
