import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const SURVEY_TITLE = "Baseline UMKM Feb 2026";

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

export type SurveyAnswer = {
  question_id: string;
  question_text: string;
  order_index: number;
  answer_text: string | null;
  answer_value: string | number | null;
  selected_options: string[];
};

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
const normalizePhone = (value: string | null | undefined) => (value ? value.replace(/\D+/g, "") : "");

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

export async function getSurveyAnswersByGuid(guid: string): Promise<SurveyAnswer[] | null> {
  if (!guid) return null;

  // 1) Ambil email/telepon dari cms_customers
  const { data: cmsRow, error: cmsErr } = await supabase
    .from("cms_customers")
    .select("email, phone_number")
    .eq("guid", guid)
    .maybeSingle();

  if (cmsErr) {
    throw new Error(`Failed to fetch cms_customer: ${cmsErr.message}`);
  }

  const email = normalizeEmail(cmsRow?.email);
  const phone = normalizePhone(cmsRow?.phone_number);

  if (!email && !phone) return null;

  // 2) Cari app_user.id berdasarkan email/telepon
  let appUserId: string | null = null;

  if (email) {
    const { data: userByEmail, error: emailErr } = await supabase
      .from("app_users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (emailErr) {
      throw new Error(`Failed to lookup app_user by email: ${emailErr.message}`);
    }
    appUserId = userByEmail?.id ?? null;
  }

  if (!appUserId && phone) {
    const { data: userByPhone, error: phoneErr } = await supabase
      .from("app_users")
      .select("id, phone")
      .ilike("phone", `%${phone}%`)
      .maybeSingle();

    if (phoneErr) {
      throw new Error(`Failed to lookup app_user by phone: ${phoneErr.message}`);
    }
    appUserId = userByPhone?.id ?? null;
  }

  if (!appUserId) return null;

  // 3) Cari survey baseline
  const surveyId = await resolveBaselineSurveyId();
  if (!surveyId) return null;

  // 4) Ambil response untuk user ini (harus unik per survey)
  const { data: responseRow, error: respErr } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("survey_id", surveyId)
    .eq("user_id", appUserId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (respErr) {
    throw new Error(`Failed to fetch survey response: ${respErr.message}`);
  }

  const responseId = responseRow?.id as string | undefined;
  if (!responseId) return [];

  // 5) Ambil questions dan answers
  const [{ data: questions, error: qErr }, { data: answers, error: aErr }] = await Promise.all([
    supabase
      .from("survey_questions")
      .select("id, question_text, order_index")
      .eq("survey_id", surveyId),
    supabase
      .from("survey_answers")
      .select("question_id, answer_text, answer_value, selected_options")
      .eq("response_id", responseId),
  ]);

  if (qErr) throw new Error(`Failed to load survey questions: ${qErr.message}`);
  if (aErr) throw new Error(`Failed to load survey answers: ${aErr.message}`);

  const answerMap = new Map(
    (answers ?? []).map((a) => [a.question_id as string, a])
  );

  const result: SurveyAnswer[] = (questions ?? [])
    .map((q) => {
      const ans = answerMap.get(q.id as string);
      const rawSelected = ans?.selected_options;
      let selected: string[] = [];
      if (Array.isArray(rawSelected)) {
        selected = rawSelected.map((v) => String(v)).filter(Boolean);
      } else if (typeof rawSelected === "string") {
        try {
          const parsed = JSON.parse(rawSelected);
          if (Array.isArray(parsed)) selected = parsed.map((v) => String(v)).filter(Boolean);
        } catch {
          /* ignore parse error */
        }
      }

      return {
        question_id: q.id as string,
        question_text: q.question_text as string,
        order_index: q.order_index as number,
        answer_text: (ans?.answer_text as string | null) ?? null,
        answer_value: (ans?.answer_value as string | number | null) ?? null,
        selected_options: selected,
      };
    })
    .sort((a, b) => a.order_index - b.order_index);

  return result;
}

const resolveBaselineSurveyId = async (): Promise<string | null> => {
  const { data: surveyByTitle, error: surveyErr } = await supabase
    .from("surveys")
    .select("id, title")
    .eq("title", SURVEY_TITLE)
    .maybeSingle();

  if (surveyErr) {
    throw new Error(`Failed to find survey by title: ${surveyErr.message}`);
  }

  if (surveyByTitle?.id) return surveyByTitle.id as string;

  const { data: latestSurvey, error: latestErr } = await supabase
    .from("surveys")
    .select("id, title")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    throw new Error(`Failed to load latest active survey: ${latestErr.message}`);
  }

  return (latestSurvey?.id as string | undefined) ?? null;
};
