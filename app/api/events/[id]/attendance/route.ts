import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }

    // Verify event belongs to user's company
    const { data: event } = await supabase
      .from("training_events")
      .select("id, name, company_id")
      .eq("id", eventId)
      .maybeSingle();

    if (!event) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
    if (event.company_id !== user.company_id && user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("attendance_logs")
      .select("id, email, full_name, survey_submitted, attended_at")
      .eq("event_id", eventId)
      .order("attended_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ attendance: data ?? [], event_name: event.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
