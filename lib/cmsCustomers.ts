import "server-only";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_NAME = "AI untuk UMKM";
const CAMPAIGN_REFERRAL_CODE = "CB6aXl";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export type ProductEntry = {
  product_name?: string | null;
  name?: string | null;
  product?: string | null;
  expired_at?: string | null;
};

export type CmsCustomer = {
  guid: string | null;
  email: string | null;
  phone_number: string | null;
  referal_code: string | null;
  full_name?: string | null;
  username?: string | null;
  subscribe_list: unknown;
  product_list?: unknown;
};

export type ActivityStatus = "active" | "idle" | "pasif";

export type CampaignCustomer = {
  guid: string | null;
  email: string | null;
  full_name?: string | null;
  username?: string | null;
  phone: string | null;
  referal_code: string | null;
  subscribe_list: string[];
  product_list: ProductEntry[];
  status: "active" | "expired" | "registered";
  expires_at: string | null;
  activity_status: ActivityStatus;
  last_debit_usage: string | null;
};

export type CampaignSummary = {
  registeredUsers: number;
  activeUsers: number;
  expiredUsers: number;
  purchasers: number;
  transactions: number;
};

export type CampaignResult = {
  customers: CampaignCustomer[];
  summary: CampaignSummary;
  companyName?: string | null;
  surveySummary?: SurveySummary | null;
};

export type SurveySummary = {
  totalRespondents: number;
  completionRate: number; // 0-1
  averageScore: number; // 1-5
  nps: number; // -100 to 100
  satisfactionBreakdown: { name: string; value: number; color: string }[];
  painPoints: { name: string; value: number }[];
  insights: string[];
  quotes: { sentiment: "positif" | "netral" | "negatif"; quote: string }[];
};

const normalizeName = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const toSubscribeList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") {
          const obj = v as Record<string, unknown>;
          const candidate =
            (obj.product_name as string | null | undefined) ??
            (obj.name as string | null | undefined) ??
            (obj.product as string | null | undefined);
          if (candidate) return candidate;
          try {
            return JSON.stringify(obj);
          } catch {
            return "[object]";
          }
        }
        return String(v);
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      /* fall back to comma-split */
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.product_list)) {
      return toSubscribeList(obj.product_list);
    }
    const candidate =
      (obj.product_name as string | null | undefined) ??
      (obj.name as string | null | undefined) ??
      (obj.product as string | null | undefined);
    if (candidate) return [candidate];
    try {
      return [JSON.stringify(obj)];
    } catch {
      return [];
    }
  }
  return [];
};

const toProductList = (value: unknown): ProductEntry[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    const flattened: ProductEntry[] = [];
    for (const item of value) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (Array.isArray(obj.product_list)) {
          // Nested array inside subscribe_list entry
          flattened.push(...toProductList(obj.product_list));
          continue;
        }
        flattened.push({
          product_name:
            (obj.product_name as string | null | undefined) ??
            (obj.name as string | null | undefined) ??
            (obj.product as string | null | undefined) ??
            null,
          expired_at: (obj.expired_at as string | null | undefined) ?? null,
        });
        continue;
      }
      if (typeof item === "string") {
        flattened.push({ product_name: item });
        continue;
      }
      flattened.push({ product_name: String(item) });
    }
    return flattened;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as ProductEntry[];
    } catch {
      return [];
    }
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.product_list)) {
      return toProductList(obj.product_list);
    }
    const candidate =
      (obj.product_name as string | null | undefined) ??
      (obj.name as string | null | undefined) ??
      (obj.product as string | null | undefined);
    if (candidate) {
      return [{ product_name: candidate, expired_at: (obj.expired_at as string) ?? null }];
    }
  }
  return [];
};

const dedupeCustomers = (rows: CmsCustomer[]): CmsCustomer[] => {
  const seen = new Set<string>();
  const result: CmsCustomer[] = [];

  for (const row of rows) {
    const key = row.guid || row.email || row.phone_number;
    if (!key) {
      // keep rows without identifiers but ensure uniqueness with incremental key
      const fallbackKey = `__anonymous_${result.length}`;
      seen.add(fallbackKey);
      result.push(row);
      continue;
    }

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(row);
  }

  return result;
};

const extractProductName = (entry: ProductEntry) =>
  normalizeName(entry.product_name ?? entry.name ?? entry.product ?? "");

const computeStatus = (
  customer: CmsCustomer,
  now: Date,
  targetName: string
): { status: CampaignCustomer["status"]; expiresAt: string | null; subscribeList: string[]; productList: ProductEntry[] } => {
  const subscribeList = toSubscribeList(customer.subscribe_list);
  const productList = toProductList(customer.product_list ?? customer.subscribe_list);
  const hasProductInSubscription = subscribeList.some(
    (item) => normalizeName(item) === targetName
  );

  const productEntries = productList.filter(
    (entry) => extractProductName(entry) === targetName
  );

  const parsedDates = productEntries
    .map((entry) => (entry.expired_at ? new Date(entry.expired_at) : null))
    .filter((v): v is Date => Boolean(v));

  const hasExpired = parsedDates.some((date) => date.getTime() < now.getTime());
  const allFuture = parsedDates.length > 0 && parsedDates.every((date) => date.getTime() >= now.getTime());

  if (hasProductInSubscription && allFuture) {
    return { status: "active", expiresAt: productEntries[productEntries.length - 1]?.expired_at ?? null, subscribeList, productList };
  }

  if (hasProductInSubscription && hasExpired) {
    return { status: "expired", expiresAt: productEntries[productEntries.length - 1]?.expired_at ?? null, subscribeList, productList };
  }

  return { status: "registered", expiresAt: null, subscribeList, productList };
};

const computeActivity = (lastDebitAt: string | null, now: Date): { activity: ActivityStatus; lastUsage: string | null } => {
  if (!lastDebitAt) return { activity: "pasif", lastUsage: null };

  const dt = new Date(lastDebitAt);
  if (Number.isNaN(dt.getTime())) {
    return { activity: "pasif", lastUsage: null };
  }

  const diffDays = (now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 7) return { activity: "active", lastUsage: dt.toISOString() };
  if (diffDays <= 30) return { activity: "idle", lastUsage: dt.toISOString() };
  return { activity: "pasif", lastUsage: dt.toISOString() };
};

type AnswerRow = {
  question_id: string;
  response_id: string;
  answer_text: string | null;
  answer_value: number | null;
  selected_options: unknown;
};

const SURVEY_TITLE = "Baseline UMKM Feb 2026";
const RATING_SATISFACTION_ORDER = 12; // Skor kondisi bisnis (1-5)
const RATING_NPS_ORDER = 25; // Skor kesiapan (1-5) -> dipetakan ke NPS gaya 5 poin
const PAIN_POINT_ORDER = 24; // Tantangan utama usaha

const colors = {
  positive: "#22c55e",
  neutral: "#facc15",
  negative: "#ef4444",
};

const toOptionsArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      // fall through
    }
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const computeSurveySummary = async (companyId?: string | null): Promise<SurveySummary | null> => {
  const { data: survey, error: surveyErr } = await supabase
    .from("surveys")
    .select("id")
    .eq("title", SURVEY_TITLE)
    .maybeSingle();

  if (surveyErr) {
    throw new Error(`Gagal mencari survey: ${surveyErr.message}`);
  }

  if (!survey?.id) return null;

  const responseQuery = supabase
    .from("survey_responses")
    .select("id, completion_time_seconds")
    .eq("survey_id", survey.id);

  if (companyId) {
    responseQuery.eq("company_id", companyId);
  }

  const { data: responses, error: responseErr } = await responseQuery;
  if (responseErr) {
    throw new Error(`Gagal memuat responses: ${responseErr.message}`);
  }

  if (!responses || responses.length === 0) return null;

  const responseIds = responses.map((r) => r.id as string);
  const { data: questions, error: qErr } = await supabase
    .from("survey_questions")
    .select("id, order_index")
    .eq("survey_id", survey.id);

  if (qErr) {
    throw new Error(`Gagal memuat questions: ${qErr.message}`);
  }

  const byOrder = new Map<number, string>();
  for (const q of questions ?? []) {
    byOrder.set(q.order_index as number, q.id as string);
  }

  const targetQuestionIds = Array.from(
    [RATING_SATISFACTION_ORDER, RATING_NPS_ORDER, PAIN_POINT_ORDER]
      .map((o) => byOrder.get(o))
      .filter((v): v is string => Boolean(v))
  );

  if (targetQuestionIds.length === 0) return null;

  const { data: answers, error: ansErr } = await supabase
    .from("survey_answers")
    .select("question_id, response_id, answer_text, answer_value, selected_options")
    .in("response_id", responseIds)
    .in("question_id", targetQuestionIds);

  if (ansErr) {
    throw new Error(`Gagal memuat jawaban survey: ${ansErr.message}`);
  }

  const satisfactionQ = byOrder.get(RATING_SATISFACTION_ORDER);
  const npsQ = byOrder.get(RATING_NPS_ORDER);
  const painQ = byOrder.get(PAIN_POINT_ORDER);

  const satisfactionAnswers = (answers ?? []).filter((a) => a.question_id === satisfactionQ);
  const npsAnswers = (answers ?? []).filter((a) => a.question_id === npsQ);
  const painAnswers = (answers ?? []).filter((a) => a.question_id === painQ);

  const ratingValues = satisfactionAnswers
    .map((a) => (typeof a.answer_value === "number" ? a.answer_value : parseInt(String(a.answer_value ?? a.answer_text ?? ""), 10)))
    .filter((v) => Number.isFinite(v)) as number[];

  const avgScore =
    ratingValues.length > 0 ? ratingValues.reduce((sum, v) => sum + v, 0) / ratingValues.length : 0;

  const buckets = { positive: 0, neutral: 0, negative: 0 };
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  satisfactionAnswers.forEach((a) => {
    const raw =
      typeof a.answer_value === "number"
        ? a.answer_value
        : parseInt(String(a.answer_value ?? a.answer_text ?? ""), 10);
    const val = Number.isFinite(raw) ? (raw as number) : null;
    if (!val) return;
    if (distribution[val as 1 | 2 | 3 | 4 | 5] !== undefined) {
      distribution[val as 1 | 2 | 3 | 4 | 5] += 1;
    }
    if (val >= 4) buckets.positive += 1;
    else if (val <= 2) buckets.negative += 1;
    else buckets.neutral += 1;
  });

  const totalRatings = Object.values(distribution).reduce((a, b) => a + b, 0);
  const satisfactionBreakdown =
    totalRatings === 0
      ? []
      : [
          { name: "Puas", value: Math.round((distribution[4] + distribution[5]) / totalRatings * 100), color: colors.positive },
          { name: "Netral", value: Math.round(distribution[3] / totalRatings * 100), color: colors.neutral },
          { name: "Tidak Puas", value: Math.round((distribution[1] + distribution[2]) / totalRatings * 100), color: colors.negative },
        ];

  const painCount = new Map<string, number>();
  const ratingByResponse = new Map<string, number>();
  satisfactionAnswers.forEach((a) => {
    const raw =
      typeof a.answer_value === "number"
        ? a.answer_value
        : parseInt(String(a.answer_value ?? a.answer_text ?? ""), 10);
    if (Number.isFinite(raw)) ratingByResponse.set(a.response_id, raw as number);
  });

  painAnswers.forEach((a) => {
    const options = toOptionsArray(a.selected_options);
    const base = options.length ? options : [a.answer_text ?? "Lainnya"];
    for (const item of base) {
      const key = item || "Lainnya";
      painCount.set(key, (painCount.get(key) ?? 0) + 1);
    }
  });

  const painPoints = Array.from(painCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value: Math.round((value / responses.length) * 100) }));

  const npsValues = npsAnswers
    .map((a) => (typeof a.answer_value === "number" ? a.answer_value : parseInt(String(a.answer_value ?? a.answer_text ?? ""), 10)))
    .filter((v) => Number.isFinite(v)) as number[];

  const npsBuckets = { promoters: 0, detractors: 0, total: npsValues.length };
  npsValues.forEach((v) => {
    if (v >= 4) npsBuckets.promoters += 1;
    else if (v <= 2) npsBuckets.detractors += 1;
  });

  const nps =
    npsBuckets.total === 0
      ? 0
      : Math.round(((npsBuckets.promoters - npsBuckets.detractors) / npsBuckets.total) * 100);

  const quotes: SurveySummary["quotes"] = [];
  for (const a of painAnswers.slice(0, 5)) {
    const rating = ratingByResponse.get(a.response_id) ?? 3;
    const sentiment = rating >= 4 ? "positif" : rating <= 2 ? "negatif" : "netral";
    const quoteSource = toOptionsArray(a.selected_options)[0] ?? a.answer_text;
    if (!quoteSource) continue;
    quotes.push({ sentiment, quote: quoteSource });
  }

  const insights: string[] = [];
  if (painPoints.length > 0) insights.push(`Tantangan utama: ${painPoints[0].name}`);
  if (avgScore) insights.push(`Skor kepuasan rata-rata ${avgScore.toFixed(1)}/5`);
  insights.push(
    `Completion rate ${Math.round(
      (responses.filter((r) => r.completion_time_seconds !== null).length / responses.length) * 100
    )}%`
  );

  return {
    totalRespondents: responses.length,
    completionRate: responses.filter((r) => r.completion_time_seconds !== null).length / responses.length,
    averageScore: Number.isFinite(avgScore) ? Number(avgScore.toFixed(2)) : 0,
    nps,
    satisfactionBreakdown,
    painPoints,
    insights,
    quotes,
  };
};

export async function getCampaignDashboard(
  referralCode: string = CAMPAIGN_REFERRAL_CODE,
  productName: string = PRODUCT_NAME
): Promise<CampaignResult> {
  const targetProductKey = normalizeName(productName);

  let companyName: string | null | undefined = null;
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("metadata->>referral_code", referralCode)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to lookup company for referral code: ${companyError.message}`);
  }

  companyName = company?.name ?? null;

  const { data: excludedEmailsData, error: excludedError } = await supabase
    .from("demo_excluded_emails")
    .select("email");

  if (excludedError) {
    throw new Error(`Failed to load excluded emails: ${excludedError.message}`);
  }

  const excludedEmails = new Set(
    (excludedEmailsData ?? [])
      .map((row) => row.email?.toLowerCase().trim())
      .filter((v): v is string => Boolean(v))
  );

  const { data: customerRows, error: customerError } = await supabase
    .from("cms_customers")
    .select("guid, email, phone_number, referal_code, full_name, username, subscribe_list")
    .eq("referal_code", referralCode);

  if (customerError) {
    throw new Error(`Failed to load campaign cohort: ${customerError.message}`);
  }

  const filtered = (customerRows ?? []).filter((row) => {
    const emailLower = row.email?.toLowerCase().trim();
    return emailLower ? !excludedEmails.has(emailLower) : true;
  });

  const cohort = dedupeCustomers(filtered);

  // Use UTC to align with default Supabase/Postgres timezone.
  const now = new Date();
  const uniqueGuids = new Set<string>();
  let activeUsers = 0;
  let expiredUsers = 0;

  const campaignCustomers: CampaignCustomer[] = cohort.map((customer) => {
    if (customer.guid) {
      uniqueGuids.add(customer.guid);
    }

    const { status, expiresAt, subscribeList, productList } = computeStatus(customer, now, targetProductKey);

    if (status === "active") activeUsers += 1;
    if (status === "expired") expiredUsers += 1;

    return {
      guid: customer.guid,
      email: customer.email,
      full_name: customer.full_name,
      username: customer.username,
      phone: customer.phone_number,
      referal_code: customer.referal_code,
      subscribe_list: subscribeList,
      product_list: productList,
      status,
      expires_at: expiresAt,
      activity_status: "pasif",
      last_debit_usage: null,
    };
  });

  const cohortGuids = Array.from(uniqueGuids);
  let purchasers = 0;
  let transactions = 0;
  const lastDebitByUser = new Map<string, string | null>();

  if (cohortGuids.length > 0) {
    const txnQuery = supabase
      .from("transactions")
      .select("customer_guid")
      .eq("status", "Finished")
      .eq("valuta_code", "IDR")
      .in("customer_guid", cohortGuids);

    const { data: txns, error: txnError } = await txnQuery;

    if (txnError) {
      throw new Error(`Failed to load transactions: ${txnError.message}`);
    }

    transactions = txns?.length ?? 0;
    purchasers = new Set(
      (txns ?? [])
        .map((row) => row.customer_guid)
        .filter((v): v is string => Boolean(v))
    ).size;

    const { data: creditRows, error: creditError } = await supabase
      .from("credit_manager_transactions")
      .select("user_id, created_at")
      .eq("type", "debit")
      .in("user_id", cohortGuids)
      .order("created_at", { ascending: false });

    if (creditError) {
      throw new Error(`Failed to load debit usage: ${creditError.message}`);
    }

    for (const row of creditRows ?? []) {
      const userId = row.user_id as string | null;
      if (!userId || lastDebitByUser.has(userId)) continue;
      lastDebitByUser.set(userId, row.created_at as string | null);
    }
  }

  const customersWithActivity = campaignCustomers.map((customer) => {
    const lastDebit = customer.guid ? lastDebitByUser.get(customer.guid) ?? null : null;
    const { activity, lastUsage } = computeActivity(lastDebit, now);
    return { ...customer, activity_status: activity, last_debit_usage: lastUsage };
  });

  const surveySummary = await computeSurveySummary(company?.id as string | undefined);

  return {
    customers: customersWithActivity,
    summary: {
      registeredUsers: uniqueGuids.size,
      activeUsers,
      expiredUsers,
      purchasers,
      transactions,
    },
    companyName,
    surveySummary,
  };
}
