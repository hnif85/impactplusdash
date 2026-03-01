import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

// Service role key is required to query dashboard_users without Supabase Auth.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;
const TOKEN_TTL = "12h";

export async function POST(req: Request) {
  try {
    const { email, username, identifier, password } = await req.json();

    const loginIdentifier = (identifier ?? username ?? email)?.trim();

    if (!loginIdentifier || !password) {
      return NextResponse.json(
        { error: "Identifier (email/username) and password are required." },
        { status: 400 }
      );
    }

    const selectFields =
      "id, email, username, full_name, role, company_id, password_hash, is_active";

    // Try email first for backwards compatibility; fallback to username.
    const { data: userByEmail, error: emailError } = await supabase
      .from("dashboard_users")
      .select(selectFields)
      .eq("email", loginIdentifier)
      .maybeSingle();

    const { data: userByUsername, error: usernameError } = userByEmail
      ? { data: null, error: null }
      : await supabase
          .from("dashboard_users")
          .select(selectFields)
          .eq("username", loginIdentifier)
          .maybeSingle();

    const user = userByEmail ?? userByUsername;

    if (emailError || usernameError) {
      return NextResponse.json({ error: "Login failed." }, { status: 400 });
    }

    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    let referral_code: string | null = null;
    let company_slug: string | null = null;
    let company_name: string | null = null;

    if (user.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("slug, name, metadata")
        .eq("id", user.company_id)
        .maybeSingle();

      referral_code =
        (company?.metadata as Record<string, unknown> | null | undefined)?.referral_code as
          | string
          | null
          | undefined ?? null;
      company_slug = company?.slug ?? null;
      company_name = company?.name ?? null;
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        company_id: user.company_id,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        company_id: user.company_id,
        referral_code,
        company_slug,
        company_name,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
