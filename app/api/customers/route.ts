import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type JwtPayload = {
  sub: string;
  role: "super_admin" | "company_admin";
  company_id: string | null;
};

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const url = new URL(req.url);
    const referralCode = url.searchParams.get("referralCode");
    const companyIdParam = url.searchParams.get("companyId");

    // Determine which company scope to use.
    let targetCompanyId: string | null = null;

    if (payload.role === "company_admin") {
      // Company admins are scoped to their own company regardless of query params.
      targetCompanyId = payload.company_id;

      if (!targetCompanyId) {
        return NextResponse.json({ error: "Company is not assigned to this account." }, { status: 400 });
      }
    } else {
      // Super admin can optionally filter by referral code (company slug or metadata.referral_code) or company id.
      if (companyIdParam) {
        targetCompanyId = companyIdParam;
      } else if (referralCode) {
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("id")
          .or(
            [
              `slug.eq.${referralCode}`,
              `metadata->>referral_code.eq.${referralCode}`,
            ].join(",")
          )
          .maybeSingle();

        if (companyError) {
          return NextResponse.json({ error: "Failed to resolve referral code." }, { status: 400 });
        }

        if (!company) {
          return NextResponse.json({ error: "Referral code not found." }, { status: 404 });
        }

        targetCompanyId = company.id;
      }
    }

    const query = supabase
      .from("app_users")
      .select("id, full_name, email, profile_data, company:company_id(name, slug)", { count: "exact" });

    if (targetCompanyId) {
      query.eq("company_id", targetCompanyId);
    }

    const { data: customers, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to load customers." }, { status: 500 });
    }

    return NextResponse.json({
      count: count ?? customers?.length ?? 0,
      customers: customers ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
