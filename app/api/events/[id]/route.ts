import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { isUuid } from "@/lib/uuid";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: eventId } = await params;
    if (!eventId || !isUuid(eventId)) {
      return NextResponse.json({ error: "Event id invalid." }, { status: 400 });
    }

    const body = await req.json();
    const { is_active } = body;
    if (typeof is_active !== "boolean") {
      return NextResponse.json({ error: "is_active (boolean) required." }, { status: 400 });
    }

    const { error } = await supabase.from("training_events").update({ is_active }).eq("id", eventId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
  }
}
