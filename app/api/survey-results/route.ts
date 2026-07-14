import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { averageRating, round1 } from "@/lib/surveys/scoring";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Program results: Pre vs Post only.
 *
 * The event quiz deliberately does NOT belong here. It hangs off a single event,
 * carries an answer key, and answers "which material didn't land" - that is a
 * per-event question, served by /api/events/[id]/attendance. Pre/post hang off
 * the company, carry no key, and answer "did the program move anything".
 */

type AuthUser = { sub: string; role: string; company_id: string | null };

function getAuthUser(req: Request): AuthUser | null {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET) as AuthUser; }
  catch { return null; }
}

type QuestionRow = {
  id: string;
  survey_id: string;
  question_text: string;
  question_type: string;
  options: unknown;
  order_index: number;
};

type AnswerRow = {
  response_id: string;
  question_id: string;
  answer_text: string | null;
  answer_value: unknown;
  selected_options: unknown;
};

type Side = {
  total_answers: number;
  average: number | null;
  breakdown: { label: string; count: number; pct: number }[] | null;
  answers: string[] | null;
};

const emptySide = (): Side => ({ total_answers: 0, average: null, breakdown: null, answers: null });

function summarise(q: QuestionRow, answers: AnswerRow[], respondents: number): Side {
  const options = Array.isArray(q.options) ? (q.options as string[]) : [];

  if (q.question_type === "rating" || q.question_type === "nps") {
    const vals = answers.map((a) => Number(a.answer_value)).filter((v) => Number.isFinite(v) && v > 0);
    return {
      total_answers: vals.length,
      average: vals.length ? round1(vals.reduce((x, y) => x + y, 0) / vals.length) : null,
      breakdown: null,
      answers: null,
    };
  }

  if (q.question_type === "checkbox") {
    const counts = new Map<string, number>(options.map((o) => [o, 0]));
    for (const a of answers) {
      const selected = Array.isArray(a.selected_options) ? (a.selected_options as string[]) : [];
      for (const s of selected) if (counts.has(s)) counts.set(s, counts.get(s)! + 1);
    }
    // Checkbox is multi-select, so share is of respondents, not of picks.
    const base = answers.length || 1;
    return {
      total_answers: answers.length,
      average: null,
      breakdown: [...counts].map(([label, count]) => ({ label, count, pct: Math.round((count / base) * 100) })),
      answers: null,
    };
  }

  if (["multiple_choice", "dropdown", "yes_no"].includes(q.question_type)) {
    const counts = new Map<string, number>(options.map((o) => [o, 0]));
    let other = 0;
    for (const a of answers) {
      const val = a.answer_text
        ?? (typeof a.answer_value === "string" ? a.answer_value : null)
        ?? (Array.isArray(a.selected_options) ? (a.selected_options as string[])[0] : null)
        ?? "";
      if (counts.has(val)) counts.set(val, counts.get(val)! + 1);
      else if (val) other += 1;
    }
    const base = answers.length || 1;
    const breakdown = [...counts].map(([label, count]) => ({ label, count, pct: Math.round((count / base) * 100) }));
    if (other > 0) breakdown.push({ label: "Lainnya", count: other, pct: Math.round((other / base) * 100) });
    return { total_answers: answers.length, average: null, breakdown, answers: null };
  }

  void respondents;
  const texts = answers.map((a) => a.answer_text ?? "").filter(Boolean);
  return { total_answers: texts.length, average: null, breakdown: null, answers: texts };
}

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const referralCode = req.nextUrl.searchParams.get("referral_code") || "";

    let companyId = user.company_id;
    if (referralCode) {
      const { data: byRef } = await supabase
        .from("companies")
        .select("id")
        .eq("metadata->>referral_code", referralCode)
        .maybeSingle();
      if (byRef) companyId = byRef.id;
    }
    if (!companyId) return NextResponse.json({ error: "Company not found." }, { status: 404 });

    const { data: company } = await supabase
      .from("companies")
      .select("name, metadata")
      .eq("id", companyId)
      .maybeSingle();

    const meta = (company?.metadata ?? {}) as Record<string, unknown>;
    const preId = (meta.program_pre_survey_id as string) ?? null;
    const postId = (meta.program_post_survey_id as string) ?? null;
    const refCode = (meta.referral_code as string) ?? referralCode;

    const empty = {
      company_name: company?.name ?? null,
      program: { pre: null, post: null },
      overall: { pre: null, post: null, delta: null },
      questions: [],
    };

    if (!preId && !postId) return NextResponse.json(empty);

    const surveyIds = [preId, postId].filter(Boolean) as string[];

    const { data: surveys, error: surveysError } = await supabase
      .from("surveys")
      .select("id, title, description")
      .in("id", surveyIds);
    if (surveysError) throw new Error(surveysError.message);

    // Responses must be scoped to this company's customers - a survey row can be
    // shared across companies.
    let customerGuids: string[] = [];
    if (refCode) {
      const { data: customers } = await supabase
        .from("cms_customers")
        .select("guid")
        .eq("referal_code", refCode);
      customerGuids = (customers ?? []).map((c) => c.guid).filter(Boolean) as string[];
    }
    if (customerGuids.length === 0) return NextResponse.json(empty);

    const { data: responses, error: responsesError } = await supabase
      .from("survey_responses")
      .select("id, survey_id, customer_guid")
      .in("survey_id", surveyIds)
      .in("customer_guid", customerGuids);
    if (responsesError) throw new Error(responsesError.message);

    const { data: questions, error: questionsError } = await supabase
      .from("survey_questions")
      .select("id, survey_id, question_text, question_type, options, order_index")
      .in("survey_id", surveyIds)
      .order("order_index", { ascending: true });
    if (questionsError) throw new Error(questionsError.message);

    const responseIds = (responses ?? []).map((r) => r.id);
    let answers: AnswerRow[] = [];
    if (responseIds.length > 0) {
      const { data: answerRows, error: answersError } = await supabase
        .from("survey_answers")
        .select("response_id, question_id, answer_text, answer_value, selected_options")
        .in("response_id", responseIds);
      if (answersError) throw new Error(answersError.message);
      answers = answerRows ?? [];
    }

    const surveyOfResponse = new Map((responses ?? []).map((r) => [r.id, r.survey_id]));
    const byQuestion = new Map<string, AnswerRow[]>();
    for (const a of answers) {
      const list = byQuestion.get(a.question_id) ?? [];
      list.push(a);
      byQuestion.set(a.question_id, list);
    }

    const preRespondents = (responses ?? []).filter((r) => r.survey_id === preId).length;
    const postRespondents = (responses ?? []).filter((r) => r.survey_id === postId).length;

    // Pre and post are copies of one template, so order_index pairs them.
    const qs = (questions ?? []) as QuestionRow[];
    const preQ = new Map(qs.filter((q) => q.survey_id === preId).map((q) => [q.order_index, q]));
    const postQ = new Map(qs.filter((q) => q.survey_id === postId).map((q) => [q.order_index, q]));
    const orders = [...new Set([...preQ.keys(), ...postQ.keys()])].sort((a, b) => a - b);

    const paired = orders.map((order) => {
      const p = preQ.get(order);
      const s = postQ.get(order);
      const ref = p ?? s!;
      const pre = p ? summarise(p, byQuestion.get(p.id) ?? [], preRespondents) : emptySide();
      const post = s ? summarise(s, byQuestion.get(s.id) ?? [], postRespondents) : emptySide();
      return {
        order_index: order,
        text: ref.question_text,
        type: ref.question_type,
        pre,
        post,
        delta: pre.average !== null && post.average !== null ? round1(post.average - pre.average) : null,
      };
    });

    // Overall program score: the same rating average used per participant, so the
    // headline and the per-user table can never disagree.
    const ratingIdsFor = (surveyId: string | null) =>
      new Set(qs.filter((q) => q.survey_id === surveyId && q.question_type === "rating").map((q) => q.id));
    const overallFor = (surveyId: string | null) => {
      if (!surveyId) return null;
      const ratingIds = ratingIdsFor(surveyId);
      const perPerson = (responses ?? [])
        .filter((r) => r.survey_id === surveyId)
        .map((r) => averageRating(answers.filter((a) => a.response_id === r.id), ratingIds))
        .filter((v): v is number => v !== null);
      return perPerson.length ? round1(perPerson.reduce((x, y) => x + y, 0) / perPerson.length) : null;
    };
    void surveyOfResponse;

    const overallPre = overallFor(preId);
    const overallPost = overallFor(postId);

    const titleOf = (id: string | null) => surveys?.find((s) => s.id === id) ?? null;

    return NextResponse.json({
      company_name: company?.name ?? null,
      program: {
        pre: preId ? { id: preId, title: titleOf(preId)?.title ?? null, respondents: preRespondents } : null,
        post: postId ? { id: postId, title: titleOf(postId)?.title ?? null, respondents: postRespondents } : null,
      },
      overall: {
        pre: overallPre,
        post: overallPost,
        delta: overallPre !== null && overallPost !== null ? round1(overallPost - overallPre) : null,
      },
      // Shared with participants after the program; the public page asks for an
      // email before showing any questions.
      links: {
        program_post: postId && refCode ? `/survey/${postId}?ref=${encodeURIComponent(refCode)}` : null,
        program_pre: preId && refCode ? `/survey/${preId}?ref=${encodeURIComponent(refCode)}` : null,
      },
      rating_scale_max: 5,
      questions: paired,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
