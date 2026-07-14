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
  event_type: z.string().optional(),
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
    return NextResponse.json({ events: data ?? [] });
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
      event_type: data.event_type || "event",
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
      return NextResponse.json({ error: "Bad Request", issues: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
