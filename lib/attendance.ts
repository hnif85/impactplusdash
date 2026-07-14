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

/**
 * `select("*")` on purpose: post_survey_id is added by a separate migration, and
 * naming it explicitly would make every read fail until that migration lands.
 * This way the field is simply undefined beforehand.
 */
export async function getEvent(eventId: string) {
  const { data, error } = await supabase
    .from("training_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load event: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    event_date: data.event_date as string | null,
    // Needed by eventDays(): without them a multi-day event reads as one day.
    start_date: (data.start_date as string | null) ?? null,
    end_date: (data.end_date as string | null) ?? null,
    location: data.location as string | null,
    is_active: data.is_active as boolean,
    company_id: data.company_id as string,
    // survey_id is the event PRE survey; post_survey_id the event POST survey.
    survey_id: (data.survey_id as string | null) ?? null,
    post_survey_id: (data.post_survey_id as string | null | undefined) ?? null,
  };
}

/**
 * Multi-day events: one event row, one check-in per participant per day.
 * Pre/post surveys stay once-per-participant because hasSurveyCompleted() is
 * keyed on (survey, customer) - day 2 skips them for free.
 */

/** Bontang is WITA; Serang is WIB. Set companies.metadata.timezone to override. */
const DEFAULT_TZ = "Asia/Jakarta";

/**
 * Today in the event's local zone. Never CURRENT_DATE: Postgres runs in UTC, so
 * an 07:00 WITA check-in would be filed under the previous day.
 */
export function localToday(timeZone: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DEFAULT_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Every date the event runs, from start_date..end_date (falls back to event_date). */
export function eventDays(event: { start_date?: string | null; end_date?: string | null; event_date?: string | null }): string[] {
  const start = event.start_date ?? event.event_date;
  if (!start) return [];
  const end = event.end_date ?? start;
  const days: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || last < cur) return [start];
  // A guard, not a limit: a typo in end_date must not spin forever.
  for (let i = 0; i < 60 && cur <= last; i++) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Cached probe: the attendance_date column arrives in a separate migration, and
 * attendance must not break in a training room while that is pending.
 */
let attendanceDateColumn: boolean | null = null;
export async function supportsAttendanceDate() {
  if (attendanceDateColumn !== null) return attendanceDateColumn;
  const { error } = await supabase.from("attendance_logs").select("attendance_date").limit(1);
  attendanceDateColumn = !error;
  return attendanceDateColumn;
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
  const str = (k: string) => (meta?.[k] as string | null | undefined) ?? null;
  return {
    id: data.id,
    name: data.name as string,
    referral_code: str("referral_code"),
    program_pre_survey_id: str("program_pre_survey_id"),
    program_post_survey_id: str("program_post_survey_id"),
    logo_url: str("logo_url"),
    instagram: str("instagram"),
    timezone: str("timezone"),
  };
}

/**
 * Every pre-survey a participant must complete before attendance is recorded,
 * in the order they are asked.
 */
export async function pendingPreSurveys(
  event: { survey_id: string | null },
  company: { program_pre_survey_id: string | null },
  customerGuid: string
) {
  const required: { id: string; kind: "program_pre" | "event_pre" }[] = [];
  if (company.program_pre_survey_id) required.push({ id: company.program_pre_survey_id, kind: "program_pre" });
  if (event.survey_id) required.push({ id: event.survey_id, kind: "event_pre" });

  const pending: typeof required = [];
  for (const r of required) {
    if (!(await hasSurveyCompleted(r.id, customerGuid))) pending.push(r);
  }
  return pending;
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

/** Dates this participant has already checked in on, for this event. */
export async function attendedDates(eventId: string, email: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("event_id", eventId)
    .ilike("email", normalizeEmail(email));
  if (error) throw new Error(`Failed to check attendance: ${error.message}`);

  return (data ?? [])
    .map((r) => {
      const d = (r as { attendance_date?: string | null }).attendance_date;
      if (d) return d;
      // Pre-migration rows carry only a timestamp.
      return r.attended_at ? String(r.attended_at).slice(0, 10) : null;
    })
    .filter(Boolean) as string[];
}

/** Has this participant checked in on this specific day? */
export async function hasAttendedOn(eventId: string, email: string, date: string) {
  if (!(await supportsAttendanceDate())) {
    // Without the column there is only one check-in per event, ever.
    return (await attendedDates(eventId, email)).length > 0;
  }
  return (await attendedDates(eventId, email)).includes(date);
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

export async function submitAttendance(
  eventId: string,
  email: string,
  customerGuid: string | null,
  fullName: string,
  surveySubmitted = false,
  attendanceDate?: string
) {
  const row: Record<string, unknown> = {
    event_id: eventId,
    email: normalizeEmail(email),
    customer_guid: customerGuid,
    full_name: fullName,
    survey_submitted: surveySubmitted,
  };
  if (attendanceDate && (await supportsAttendanceDate())) {
    row.attendance_date = attendanceDate;
  }

  const { error } = await supabase.from("attendance_logs").insert(row);
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
