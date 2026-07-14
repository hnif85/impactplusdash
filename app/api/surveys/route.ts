import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
    const { data, error } = await supabase
      .from("surveys")
      .select("id, title")
      .eq("is_active", true)
      .order("title", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ surveys: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
