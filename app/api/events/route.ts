import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { z } from "zod";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAuthUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; role: string; company_id: string | null };
  } catch { return null; }
}

const createSchema = z.object({
  name: z.string().min(1),
  event_date: z.string().optional(),
  location: z.string().optional(),
  // Mirrors the training_events_event_type_check constraint. Validating here
  // turns a raw Postgres constraint error into a readable 400.
  event_type: z.enum(["online", "offline"]).optional(),
  description: z.string().optional(),
  max_participants: z.number().int().positive().optional(),
  survey_id: z.string().uuid().optional().nullable(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const companyId = req.nextUrl.searchParams.get("company_id") || user.company_id;
    if (!companyId) return NextResponse.json({ error: "Company ID required." }, { status: 400 });

    const { data, error } = await supabase
      .from("training_events")
      .select("id, name, event_date, location, event_type, is_active, survey_id, description, start_date, end_date, max_participants, created_at")
      .eq("company_id", companyId)
      .order("event_date", { ascending: false });

    if (error) throw new Error(error.message);

    const events = data ?? [];

    // Attendance is per-event, so it can be attached to each card.
    const attendanceCount: Record<string, number> = {};
    const attendeesOf: Record<string, string[]> = {};
    if (events.length > 0) {
      const { data: logs } = await supabase
        .from("attendance_logs")
        .select("event_id, customer_guid")
        .in("event_id", events.map((e) => e.id));
      for (const l of logs ?? []) {
        attendanceCount[l.event_id] = (attendanceCount[l.event_id] ?? 0) + 1;
        if (l.customer_guid) (attendeesOf[l.event_id] ??= []).push(l.customer_guid);
      }
    }

    // Pre/post surveys hang off the company, not the event, so these counts
    // describe the whole program - they'd be identical on every card. Return
    // them once, separately, instead of pretending they are per-event.
    const program = {
      pre_title: null as string | null,
      post_title: null as string | null,
      pre_filled: 0,
      post_filled: 0,
      total_customers: 0,
    };

    const summary = { attendees_total: 0, pre_total: 0, post_total: 0, both_total: 0 };

    const { data: company } = await supabase
      .from("companies")
      .select("metadata")
      .eq("id", companyId)
      .maybeSingle();

    const meta = (company?.metadata ?? {}) as Record<string, unknown>;
    const preId = (meta.program_pre_survey_id as string) ?? null;
    const postId = (meta.program_post_survey_id as string) ?? null;
    const referralCode = (meta.referral_code as string) ?? null;
    const programSurveyIds = [preId, postId].filter(Boolean) as string[];

    if (programSurveyIds.length > 0 && referralCode) {
      const { data: titles } = await supabase
        .from("surveys")
        .select("id, title")
        .in("id", programSurveyIds);
      for (const t of titles ?? []) {
        if (t.id === preId) program.pre_title = t.title;
        if (t.id === postId) program.post_title = t.title;
      }

      const { data: customers } = await supabase
        .from("cms_customers")
        .select("guid")
        .eq("referal_code", referralCode);
      const guids = (customers ?? []).map((c) => c.guid).filter(Boolean) as string[];
      program.total_customers = guids.length;

      if (guids.length > 0) {
        const { data: responses } = await supabase
          .from("survey_responses")
          .select("survey_id, customer_guid")
          .in("survey_id", programSurveyIds)
          .in("customer_guid", guids);

        const preGuids = new Set<string>();
        const postGuids = new Set<string>();
        for (const r of responses ?? []) {
          if (r.survey_id === preId) { program.pre_filled += 1; if (r.customer_guid) preGuids.add(r.customer_guid); }
          if (r.survey_id === postId) { program.post_filled += 1; if (r.customer_guid) postGuids.add(r.customer_guid); }
        }

        // Averages are per event, over attendees of that event - "of the people
        // who actually showed up, how many followed through".
        for (const e of events) {
          const attendees = attendeesOf[e.id] ?? [];
          summary.attendees_total += attendanceCount[e.id] ?? 0;
          summary.pre_total += attendees.filter((g) => preGuids.has(g)).length;
          summary.post_total += attendees.filter((g) => postGuids.has(g)).length;
          summary.both_total += attendees.filter((g) => preGuids.has(g) && postGuids.has(g)).length;
        }
      }
    }

    const n = events.length;
    const avg = (total: number) => (n > 0 ? Math.round((total / n) * 10) / 10 : 0);
    const share = (total: number) =>
      summary.attendees_total > 0 ? Math.round((total / summary.attendees_total) * 100) : null;

    return NextResponse.json({
      events: events.map((e) => ({ ...e, attendance_count: attendanceCount[e.id] ?? 0 })),
      program,
      summary: {
        event_count: n,
        avg_attendees: avg(summary.attendees_total),
        avg_pre: avg(summary.pre_total),
        avg_post: avg(summary.post_total),
        avg_both: avg(summary.both_total),
        // Shares are of attendees, so a card can say "12 of 32 attendees (38%)".
        pct_pre: share(summary.pre_total),
        pct_post: share(summary.post_total),
        pct_both: share(summary.both_total),
        attendees_total: summary.attendees_total,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "super_admin" && !user.company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data = createSchema.parse(body);

    const { error } = await supabase.from("training_events").insert({
      name: data.name,
      company_id: user.company_id,
      event_date: data.event_date || null,
      location: data.location || null,
      event_type: data.event_type || "offline",
      description: data.description || null,
      max_participants: data.max_participants || null,
      survey_id: data.survey_id || null,
      is_active: true,
      start_date: data.start_date || data.event_date || null,
      end_date: data.end_date || null,
      created_by: user.sub,
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return NextResponse.json(
        { error: first ? `${first.path.join(".")}: ${first.message}` : "Bad Request", issues: err.flatten() },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
