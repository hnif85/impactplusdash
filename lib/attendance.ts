import "server-only";
import { createClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./surveyPublic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type ValidateResult =
  | { status: "unregistered" }
  | { status: "already_attended"; customer: { guid: string; full_name: string; email: string } }
  | { status: "needs_survey"; customer: { guid: string; full_name: string; email: string }; survey_id: string }
  | { status: "needs_attendance"; customer: { guid: string; full_name: string; email: string } };

export async function getEvent(eventId: string) {
  const { data, error } = await supabase
    .from("training_events")
    .select("id, name, event_date, location, is_active, company_id, survey_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load event: ${error.message}`);
  return data ?? null;
}

export async function getCompanyRef(companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, metadata")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load company: ${error.message}`);
  if (!data) return null;
  const meta = data.metadata as Record<string, unknown> | null;
  const referral_code = (meta?.referral_code as string | null | undefined) ?? null;
  const program_pre_survey_id = (meta?.program_pre_survey_id as string | null | undefined) ?? null;
  return { id: data.id, name: data.name, referral_code, program_pre_survey_id };
}

export async function findCustomerByEmailAndRef(email: string, referralCode: string) {
  const { data, error } = await supabase
    .from("cms_customers")
    .select("guid, full_name, email")
    .eq("referal_code", referralCode)
    .ilike("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw new Error(`Failed to find customer: ${error.message}`);
  return data ?? null;
}

export async function hasSurveyCompleted(surveyId: string, customerGuid: string) {
  const { data, error } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("survey_id", surveyId)
    .eq("customer_guid", customerGuid)
    .maybeSingle();
  if (error) throw new Error(`Failed to check survey: ${error.message}`);
  return Boolean(data);
}

export async function hasAttended(eventId: string, email: string) {
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("id")
    .eq("event_id", eventId)
    .ilike("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw new Error(`Failed to check attendance: ${error.message}`);
  return Boolean(data);
}

export async function submitSurveyForCustomer(params: {
  surveyId: string;
  customerGuid: string;
  answers: Array<{
    questionId: string;
    answerText?: string | null;
    answerValue?: string | number | null;
    selectedOptions?: string[] | null;
  }>;
}) {
  const { surveyId, customerGuid, answers } = params;

  const responseRes = await supabase
    .from("survey_responses")
    .insert({
      survey_id: surveyId,
      customer_guid: customerGuid,
      user_id: null,
      company_id: null,
    })
    .select("id")
    .maybeSingle();

  if (responseRes.error) throw new Error(`Failed to create response: ${responseRes.error.message}`);
  const responseId = responseRes.data?.id as string;
  if (!responseId) throw new Error("Response ID missing");

  const payload = answers.map((a) => ({
    response_id: responseId,
    question_id: a.questionId,
    answer_text: a.answerText ?? null,
    answer_value: a.answerValue ?? null,
    selected_options: a.selectedOptions ?? null,
  }));

  const { error } = await supabase.from("survey_answers").insert(payload);
  if (error) throw new Error(`Failed to save answers: ${error.message}`);
}

export async function submitAttendance(eventId: string, email: string, customerGuid: string | null, fullName: string) {
  const normEmail = normalizeEmail(email);
  const { error } = await supabase.from("attendance_logs").insert({
    event_id: eventId,
    email: normEmail,
    customer_guid: customerGuid,
    full_name: fullName,
    survey_submitted: false,
  });
  if (error) throw new Error(`Failed to log attendance: ${error.message}`);
}

export async function updateAttendanceSurveyFlag(eventId: string, email: string) {
  const normEmail = normalizeEmail(email);
  const { error } = await supabase
    .from("attendance_logs")
    .update({ survey_submitted: true })
    .eq("event_id", eventId)
    .ilike("email", normEmail);
  if (error) throw new Error(`Failed to update attendance: ${error.message}`);
}
