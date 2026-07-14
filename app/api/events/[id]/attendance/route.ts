import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { averageRating, quizScore, delta, type ScoringAnswer } from "@/lib/surveys/scoring";
import { eventDays } from "@/lib/attendance";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

function getAuthUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; role: string; company_id: string | null }; }
  catch { return null; }
}

type ScoreRow = {
  key: string;
  customer_guid: string | null;
  email: string;
  full_name: string;
  attended: boolean;
  attended_at: string | null;
  attended_dates: string[];
  pre: number | null;
  post: number | null;
  delta: number | null;
  quiz_pre: { pct: number; correct: number } | null;
  quiz_post: { pct: number; correct: number } | null;
  /** Percentage points gained between the two quiz sittings. */
  quiz_delta: number | null;
};

type AnswerRow = ScoringAnswer & { response_id: string };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }

    // select("*") so the post_survey_id column, added by a later migration,
    // does not break this read before it exists.
    const { data: event } = await supabase
      .from("training_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    if (event.company_id !== user.company_id && user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // select("*") so attendance_date (separate migration) does not break this.
    const { data: attendance, error: attendanceError } = await supabase
      .from("attendance_logs")
      .select("*")
      .eq("event_id", eventId)
      .order("attended_at", { ascending: false });

    if (attendanceError) throw new Error(attendanceError.message);

    // A multi-day event has one row per participant per day.
    const eventDayList = eventDays(event as { start_date?: string | null; end_date?: string | null; event_date?: string | null });
    const dayOf = (r: Record<string, unknown>) =>
      (r.attendance_date as string | null) ?? (r.attended_at ? String(r.attended_at).slice(0, 10) : null);

    // Pre/post surveys live on the company, not the event. Two events under one
    // company would therefore report the same pre/post responses.
    let preId: string | null = null;
    let postId: string | null = null;
    let referralCode: string | null = null;

    let companyName: string | null = null;

    if (event.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("name, metadata")
        .eq("id", event.company_id)
        .maybeSingle();
      companyName = company?.name ?? null;
      const meta = (company?.metadata ?? {}) as Record<string, unknown>;
      preId = (meta.program_pre_survey_id as string) ?? null;
      postId = (meta.program_post_survey_id as string) ?? null;
      referralCode = (meta.referral_code as string) ?? null;
    }

    // Undefined until the post_survey_id migration is applied - the UI hides the
    // link rather than erroring.
    const eventPostId = (event.post_survey_id as string | null | undefined) ?? null;

    // The event quiz is asked twice: survey_id before the event, post_survey_id
    // after. Same questions, separate survey rows - one response per survey per
    // customer is enforced by a unique index, so they cannot share an id.
    const quizPreId = (event.survey_id as string | null) ?? null;
    const quizPostId = eventPostId;
    const surveyIds = [preId, postId, quizPreId, quizPostId].filter(Boolean) as string[];

    // Per-question breakdown lives here rather than on the program results page:
    // the quiz belongs to this event and answers "which material didn't land".
    type QuizSide = { answered: number; correct: number; pct: number; options: { label: string; count: number; pct: number; is_correct: boolean }[] };
    let quizBreakdown: {
      order_index: number; text: string; correct_answer: string;
      pre: QuizSide | null; post: QuizSide | null; delta: number | null;
    }[] = [];

    const rows = new Map<string, ScoreRow>();
    const blank = (key: string, guid: string | null, email: string, name: string): ScoreRow => ({
      key, customer_guid: guid, email, full_name: name,
      attended: false, attended_at: null, attended_dates: [],
      pre: null, post: null, delta: null,
      quiz_pre: null, quiz_post: null, quiz_delta: null,
    });

    for (const a of attendance ?? []) {
      const key = a.customer_guid ?? `email:${(a.email ?? "").toLowerCase()}`;
      const existing = rows.get(key);
      const d = dayOf(a);
      if (existing) {
        // Same person, another day.
        if (d && !existing.attended_dates.includes(d)) existing.attended_dates.push(d);
        continue;
      }
      rows.set(key, {
        ...blank(key, a.customer_guid ?? null, a.email ?? "", a.full_name ?? ""),
        attended: true,
        attended_at: a.attended_at ?? null,
        attended_dates: d ? [d] : [],
      });
    }

    const surveyMeta: { pre: string | null; post: string | null; quiz: string | null; quiz_post: string | null } = {
      pre: null, post: null, quiz: null, quiz_post: null,
    };
    let quizTotal = 0;
    const surveyTitles = new Map<string, string>();

    if (surveyIds.length > 0) {
      const { data: surveyRows } = await supabase
        .from("surveys")
        .select("id, title")
        .in("id", surveyIds);
      for (const s of surveyRows ?? []) {
        surveyTitles.set(s.id, s.title);
        if (s.id === preId) surveyMeta.pre = s.title;
        if (s.id === postId) surveyMeta.post = s.title;
        if (s.id === quizPreId) surveyMeta.quiz = s.title;
        if (s.id === quizPostId) surveyMeta.quiz_post = s.title;
      }

      // A survey can be shared across companies, so responses must be scoped to
      // this company's customers.
      let customerGuids: string[] = [];
      if (referralCode) {
        const { data: customers } = await supabase
          .from("cms_customers")
          .select("guid")
          .eq("referal_code", referralCode);
        customerGuids = (customers ?? []).map((c) => c.guid).filter(Boolean) as string[];
      }

      if (customerGuids.length > 0) {
        const { data: responses, error: responsesError } = await supabase
          .from("survey_responses")
          .select("id, survey_id, customer_guid")
          .in("survey_id", surveyIds)
          .in("customer_guid", customerGuids);
        if (responsesError) throw new Error(responsesError.message);

        const responseIds = (responses ?? []).map((r) => r.id);

        const { data: questions, error: questionsError } = await supabase
          .from("survey_questions")
          .select("id, survey_id, question_type, correct_answer, question_text, options, order_index")
          .in("survey_id", surveyIds)
          .order("order_index", { ascending: true });
        if (questionsError) throw new Error(questionsError.message);

        // Pre/post carry no answer key, so the only number comparable between
        // them is the shared set of 1-5 rating questions. The quiz is the only
        // survey that is actually scored against a key.
        const ratingQ = new Set(
          (questions ?? []).filter((q) => q.question_type === "rating").map((q) => q.id)
        );
        const keyFor = (surveyId: string | null) => {
          const m = new Map<string, string>();
          if (!surveyId) return m;
          for (const q of questions ?? []) {
            if (q.survey_id === surveyId && q.correct_answer) m.set(q.id, q.correct_answer);
          }
          return m;
        };
        const answerKeyPre = keyFor(quizPreId);
        const answerKeyPost = keyFor(quizPostId);
        // The pre sitting defines the quiz length; the post copy mirrors it.
        quizTotal = answerKeyPre.size || answerKeyPost.size;

        let answers: AnswerRow[] = [];
        if (responseIds.length > 0) {
          const { data: answerRows, error: answersError } = await supabase
            .from("survey_answers")
            .select("response_id, question_id, answer_text, answer_value, selected_options")
            .in("response_id", responseIds);
          if (answersError) throw new Error(answersError.message);
          answers = answerRows ?? [];
        }

        const byResponse = new Map<string, AnswerRow[]>();
        for (const a of answers) {
          const list = byResponse.get(a.response_id) ?? [];
          list.push(a);
          byResponse.set(a.response_id, list);
        }

        if (answerKeyPre.size > 0 || answerKeyPost.size > 0) {
          const byQuestion = new Map<string, AnswerRow[]>();
          for (const a of answers) {
            const list = byQuestion.get(a.question_id) ?? [];
            list.push(a);
            byQuestion.set(a.question_id, list);
          }

          const sideFor = (q: { id: string; options: unknown; correct_answer: string | null }): QuizSide | null => {
            const list = byQuestion.get(q.id) ?? [];
            if (list.length === 0) return null;
            const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
            const counts = new Map<string, number>(opts.map((o) => [o, 0]));
            let correct = 0;
            for (const a of list) {
              const given = a.answer_text ?? (Array.isArray(a.selected_options) ? (a.selected_options as string[])[0] : null);
              if (given && counts.has(given)) counts.set(given, counts.get(given)! + 1);
              if (given === q.correct_answer) correct += 1;
            }
            const base = list.length;
            return {
              answered: base,
              correct,
              pct: Math.round((correct / base) * 100),
              options: [...counts].map(([label, count]) => ({
                label, count,
                pct: Math.round((count / base) * 100),
                is_correct: label === q.correct_answer,
              })),
            };
          };

          // The post quiz is a copy, so order_index pairs the two sittings.
          const preQs = (questions ?? []).filter((q) => q.survey_id === quizPreId && q.correct_answer);
          const postQs = (questions ?? []).filter((q) => q.survey_id === quizPostId && q.correct_answer);
          const postByOrder = new Map(postQs.map((q) => [q.order_index, q]));
          const orders = [...new Set([...preQs.map((q) => q.order_index), ...postQs.map((q) => q.order_index)])].sort((a, b) => a - b);

          quizBreakdown = orders.map((order) => {
            const p = preQs.find((q) => q.order_index === order);
            const s = postByOrder.get(order);
            const ref = p ?? s!;
            const pre = p ? sideFor(p) : null;
            const post = s ? sideFor(s) : null;
            return {
              order_index: order,
              text: ref.question_text,
              correct_answer: ref.correct_answer!,
              pre,
              post,
              delta: pre && post ? post.pct - pre.pct : null,
            };
          })
            // Weakest current state first: the material still needing work leads.
            .sort((a, b) => (a.post?.pct ?? a.pre?.pct ?? 0) - (b.post?.pct ?? b.pre?.pct ?? 0));
        }

        // Name/email for people who answered but never checked in.
        const answeredGuids = [...new Set((responses ?? []).map((r) => r.customer_guid).filter(Boolean))] as string[];
        const profiles = new Map<string, { email: string; full_name: string }>();
        if (answeredGuids.length > 0) {
          const { data: customers } = await supabase
            .from("cms_customers")
            .select("guid, email, full_name, username")
            .in("guid", answeredGuids);
          for (const c of customers ?? []) {
            // full_name is frequently null in cms_customers.
            profiles.set(c.guid, { email: c.email ?? "", full_name: c.full_name || c.username || "" });
          }
        }

        for (const r of responses ?? []) {
          if (!r.customer_guid) continue;
          const key = r.customer_guid;
          if (!rows.has(key)) {
            const p = profiles.get(key);
            rows.set(key, blank(key, key, p?.email ?? "", p?.full_name ?? ""));
          }
          const row = rows.get(key)!;
          const list = byResponse.get(r.id) ?? [];

          if (r.survey_id === preId || r.survey_id === postId) {
            const avg = averageRating(list, ratingQ);
            if (avg !== null) {
              if (r.survey_id === preId) row.pre = avg;
              else row.post = avg;
            }
          }

          if (r.survey_id === quizPreId) {
            const score = quizScore(list, answerKeyPre);
            if (score) row.quiz_pre = { pct: score.pct, correct: score.correct };
          }
          if (r.survey_id === quizPostId) {
            const score = quizScore(list, answerKeyPost);
            if (score) row.quiz_post = { pct: score.pct, correct: score.correct };
          }
        }
      }
    }

    const result = [...rows.values()].map((r) => ({
      ...r,
      attended_dates: [...r.attended_dates].sort(),
      delta: delta(r.pre, r.post),
      // Percentage points, so "40% → 80%" reads as +40, not +100%.
      quiz_delta: r.quiz_pre && r.quiz_post ? r.quiz_post.pct - r.quiz_pre.pct : null,
    }));

    // Most-complete rows first, then alphabetical.
    result.sort((a, b) => {
      const fillA = (a.pre !== null ? 2 : 0) + (a.post !== null ? 1 : 0);
      const fillB = (b.pre !== null ? 2 : 0) + (b.post !== null ? 1 : 0);
      if (fillA !== fillB) return fillB - fillA;
      return (a.full_name || a.email).localeCompare(b.full_name || b.email);
    });

    return NextResponse.json({
      attendance: result,
      event_name: event.name,
      company_name: companyName,
      event_days: eventDayList,
      total_check_ins: (attendance ?? []).length,
      survey_meta: surveyMeta,
      quiz_total: quizTotal,
      quiz_breakdown: quizBreakdown,
      rating_scale_max: 5,
      // Post-survey links are shared with participants; they open the public
      // page that asks for an email first.
      links: {
        attendance: `/attendance/${eventId}`,
        event_post: eventPostId && referralCode
          ? `/survey/${eventPostId}?ref=${encodeURIComponent(referralCode)}`
          : null,
        event_post_title: eventPostId ? (surveyTitles.get(eventPostId) ?? null) : null,
        program_post: postId && referralCode
          ? `/survey/${postId}?ref=${encodeURIComponent(referralCode)}`
          : null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
