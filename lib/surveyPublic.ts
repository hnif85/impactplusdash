import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export const normalizeEmail = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

export async function getCompanyByReferralCode(referralCode: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("metadata->>referral_code", referralCode)
    .maybeSingle();

  if (error) throw new Error(`Failed to lookup company by referral code: ${error.message}`);
  return data ?? null;
}

export async function findCustomerByEmailAndRef(email: string, referralCode: string) {
  const { data, error } = await supabase
    .from("cms_customers")
    .select("guid, full_name, email, referal_code")
    .eq("referal_code", referralCode)
    .ilike("email", normalizeEmail(email))
    .maybeSingle();

  if (error) throw new Error(`Failed to validate customer email: ${error.message}`);
  if (!data) return null;
  return data;
}

export async function findCustomerByGuidAndRef(guid: string, referralCode: string) {
  const { data, error } = await supabase
    .from("cms_customers")
    .select("guid, full_name, email, referal_code")
    .eq("referal_code", referralCode)
    .eq("guid", guid)
    .maybeSingle();

  if (error) throw new Error(`Failed to validate customer guid: ${error.message}`);
  if (!data) return null;
  return data;
}

export async function ensureSurveyActive(surveyId: string) {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from("surveys")
    .select("id, title, description, is_active, start_date, end_date")
    .eq("id", surveyId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load survey: ${error.message}`);
  if (!data) return null;

  const { is_active, start_date, end_date } = data as {
    is_active: boolean | null;
    start_date: string | null;
    end_date: string | null;
  };

  const notStarted = start_date && iso < start_date;
  const expired = end_date && iso > end_date;

  if (!is_active || notStarted || expired) return null;
  return data;
}

export async function fetchQuestions(surveyId: string) {
  const { data, error } = await supabase
    .from("survey_questions")
    .select("id, question_text, question_type, options, rating_scale, is_required, order_index")
    .eq("survey_id", surveyId)
    .order("order_index", { ascending: true });

  if (error) throw new Error(`Failed to load survey questions: ${error.message}`);
  return data ?? [];
}

export async function hasCustomerSubmitted(surveyId: string, customerGuid: string) {
  const { data, error } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("survey_id", surveyId)
    .eq("customer_guid", customerGuid)
    .maybeSingle();

  if (error) throw new Error(`Failed to check duplicate responses: ${error.message}`);
  return Boolean(data);
}

export async function insertResponse(params: {
  surveyId: string;
  customerGuid: string;
  companyId?: string | null;
  completionTimeSeconds?: number | null;
}) {
  const { surveyId, customerGuid, companyId = null, completionTimeSeconds = null } = params;
  const { data, error } = await supabase
    .from("survey_responses")
    .insert({
      survey_id: surveyId,
      company_id: companyId,
      customer_guid: customerGuid,
      user_id: null,
      completion_time_seconds: completionTimeSeconds ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to create survey response: ${error.message}`);
  if (!data?.id) throw new Error("Response ID missing after insert");
  return data.id as string;
}

export async function insertAnswers(
  responseId: string,
  answers: Array<{
    questionId: string;
    answerText?: string | null;
    answerValue?: string | number | null;
    selectedOptions?: string[] | null;
  }>
) {
  if (!answers.length) return;

  const payload = answers.map((a) => ({
    response_id: responseId,
    question_id: a.questionId,
    answer_text: a.answerText ?? null,
    answer_value: a.answerValue ?? null,
    selected_options: a.selectedOptions ?? null,
  }));

  const { error } = await supabase.from("survey_answers").insert(payload);
  if (error) throw new Error(`Failed to store survey answers: ${error.message}`);
}
