import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getCampaignDashboard } from "@/lib/cmsCustomers";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    jwt.verify(token, JWT_SECRET);

    const url = new URL(req.url);
    const referralCode = url.searchParams.get("referralCode") ?? undefined;
    const productName = url.searchParams.get("productName") ?? undefined;

    const data = await getCampaignDashboard(referralCode, productName);

    return NextResponse.json(data);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
