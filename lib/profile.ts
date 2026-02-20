import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type Profile = {
  id: string;
  customer_guid: string | null;
  full_name: string | null;
  username?: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  [key: string]: unknown;
};

export type Transaction = {
  id: string;
  user_id: string | null;
  product_name: string | null;
  created_at: string | null;
  type?: "debit" | "credit" | string | null;
  status?: string | null;
  amount?: number | null;
  [key: string]: unknown;
};

export type TransactionDailyAggregate = {
  product_name: string | null;
  date: string; // YYYY-MM-DD
  total_count: number;
  credit_count: number;
  debit_count: number;
  credit_amount: number;
  debit_amount: number;
  net_amount: number;
};

export async function getCmsCustomerEmailByGuid(guid: string): Promise<string | null> {
  if (!guid) return null;

  const { data, error } = await supabase
    .from("cms_customers")
    .select("email")
    .eq("guid", guid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch cms customer email: ${error.message}`);
  }

  return data?.email ?? null;
}

export async function getLatestProfileByGuid(customerGuid: string): Promise<Profile | null> {
  if (!customerGuid) return null;

  const { data, error } = await supabase
    .from("profile")
    .select("*")
    .eq("customer_guid", customerGuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  return data ?? null;
}

export async function getTransactionsByUser(userId: string, limit = 50): Promise<Transaction[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("credit_manager_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return data ?? [];
}

export function aggregateTransactionsDaily(transactions: Transaction[]): TransactionDailyAggregate[] {
  const map = new Map<string, TransactionDailyAggregate>();

  for (const txn of transactions) {
    if (!txn.created_at) continue;
    const date = new Date(txn.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const yyyyMmDd = date.toISOString().slice(0, 10);
    const key = `${txn.product_name ?? ""}__${yyyyMmDd}`;
    const existing = map.get(key) ?? {
      product_name: txn.product_name ?? "-",
      date: yyyyMmDd,
      total_count: 0,
      credit_count: 0,
      debit_count: 0,
      credit_amount: 0,
      debit_amount: 0,
      net_amount: 0,
    };
    existing.total_count += 1;
    const amountNum = typeof txn.amount === "number" ? txn.amount : Number(txn.amount);
    if (!Number.isNaN(amountNum)) {
      if ((txn.type ?? "").toLowerCase() === "credit") {
        existing.credit_amount += amountNum;
        existing.credit_count += 1;
        existing.net_amount += amountNum;
      } else {
        existing.debit_amount += amountNum;
        existing.debit_count += 1;
        existing.net_amount -= amountNum;
      }
    }
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.date === b.date) return (a.product_name ?? "").localeCompare(b.product_name ?? "");
    return a.date < b.date ? 1 : -1; // newest first
  });
}
