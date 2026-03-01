import { NextResponse } from "next/server";
import { z } from "zod";
import { findCustomerByEmailAndRef, getCompanyByReferralCode, normalizeEmail } from "@/lib/surveyPublic";

const schema = z.object({
  email: z.string().email(),
  referralCode: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, referralCode } = schema.parse(body);

    const company = await getCompanyByReferralCode(referralCode);
    if (!company) {
      return NextResponse.json({ valid: false, reason: "Referral code tidak dikenali." }, { status: 404 });
    }

    const customer = await findCustomerByEmailAndRef(email, referralCode);
    if (!customer) {
      return NextResponse.json({ valid: false, reason: "Email tidak terdaftar untuk referral ini." }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      customer: {
        guid: customer.guid,
        full_name: customer.full_name,
        email: normalizeEmail(customer.email),
      },
      company: {
        id: company.id,
        name: company.name,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad Request", issues: err.flatten() }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
