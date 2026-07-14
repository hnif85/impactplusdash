import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;

// Use service role so we can safely hydrate the dashboard profile server-side.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      role: string;
      company_id: string | null;
    };

    const { data: user, error } = await supabase
      .from("dashboard_users")
      .select("id, email, username, full_name, role, company_id")
      .eq("id", payload.sub)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }

    let referral_code: string | null = null;
    let company_slug: string | null = null;
    let company_name: string | null = null;
    let company_logo: string | null = null;

    if (user.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("slug, name, metadata")
        .eq("id", user.company_id)
        .maybeSingle();

      const meta = company?.metadata as Record<string, unknown> | null | undefined;
      referral_code = (meta?.referral_code as string | null | undefined) ?? null;
      company_slug = company?.slug ?? null;
      company_name = company?.name ?? null;
      company_logo = (meta?.logo_url as string | null | undefined) ?? null;
    }

    return NextResponse.json({
      ...user,
      referral_code,
      company_slug,
      company_name,
      company_logo,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
