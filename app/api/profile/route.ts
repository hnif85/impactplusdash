import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import {
  aggregateTransactionsDaily,
  getLatestProfileByGuid,
  getTransactionsByUser,
  getCmsCustomerEmailByGuid,
} from "@/lib/profile";

const JWT_SECRET = process.env.IMPACT_LINK_SECRET!;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    jwt.verify(token, JWT_SECRET);
    const url = new URL(req.url);
    const guid = url.searchParams.get("guid");
    if (!guid) return NextResponse.json({ error: "guid is required" }, { status: 400 });

    const [profile, transactions] = await Promise.all([
      getLatestProfileByGuid(guid),
      getTransactionsByUser(guid, 500),
    ]);

    // When profile row is missing, try to recover email from cms_customers for UI fallback.
    if (!profile) {
      const email = await getCmsCustomerEmailByGuid(guid);
      if (email) {
        const fallbackProfile = {
          id: guid,
          customer_guid: guid,
          full_name: null,
          username: null,
          email,
          phone: null,
          created_at: null,
        };

        const daily = aggregateTransactionsDaily(transactions);
        return NextResponse.json({ profile: fallbackProfile, transactions, daily });
      }

      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const daily = aggregateTransactionsDaily(transactions);

    return NextResponse.json({ profile, transactions, daily });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
