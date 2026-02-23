import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SURVEY_TITLE = "Baseline UMKM Feb 2026";
const MAX_RESPONSES = 400; // batasi feed ke AI agar prompt tidak bengkak

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

type QuestionRow = { id: string; question_text: string; order_index: number };
type AnswerRow = {
  question_id: string;
  response_id: string;
  answer_text: string | null;
  answer_value: number | null;
  selected_options: unknown;
};

const toOptionsArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      /* ignore */
    }
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

async function fetchSurveyId() {
  const { data: surveyByTitle, error: surveyErr } = await supabase
    .from("surveys")
    .select("id")
    .eq("title", SURVEY_TITLE)
    .maybeSingle();

  if (surveyErr) throw new Error(`Gagal mencari survey: ${surveyErr.message}`);

  if (surveyByTitle?.id) return surveyByTitle.id as string;

  const { data: latest, error: latestErr } = await supabase
    .from("surveys")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) throw new Error(`Gagal memuat survey aktif: ${latestErr.message}`);
  return latest?.id as string | undefined;
}

function buildPrompt(rows: Array<{ submitted_at: string | null; answers: Record<string, unknown> }>) {
  const header = `Kamu adalah analis bisnis. Data berikut adalah baseline survei UMKM. Setiap item = 1 responden. Tugasmu: ringkas profil umum, pola omzet & durasi usaha, cara pencatatan, platform promosi, tantangan utama (top 5), kesiapan dan persepsi AI, kisaran biaya AI yang wajar, serta 3 rekomendasi aksi cepat. Jawab ringkas dalam bahasa Indonesia, bullet-point.`;
  return `${header}\n\nDATA:\n${JSON.stringify(rows).slice(0, 120000)}`;
}

async function callOpenRouter(prompt: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY belum diset.");

  const body = {
    model: "x-ai/grok-4.1-fast",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 800,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001",
      "X-Title": "Impact Dashboard",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Tidak ada konten dari OpenRouter.");
  return content;
}

export async function POST() {
  try {
    const surveyId = await fetchSurveyId();
    if (!surveyId) {
      return NextResponse.json({ error: "Survey tidak ditemukan." }, { status: 404 });
    }

    const { data: responses, error: resErr } = await supabase
      .from("survey_responses")
      .select("id, submitted_at")
      .eq("survey_id", surveyId)
      .order("submitted_at", { ascending: false })
      .limit(MAX_RESPONSES);

    if (resErr) throw new Error(`Gagal memuat responses: ${resErr.message}`);
    if (!responses || responses.length === 0) {
      return NextResponse.json({ error: "Belum ada response untuk survey ini." }, { status: 404 });
    }

    const responseIds = responses.map((r) => r.id as string);

    const [{ data: questions, error: qErr }, { data: answers, error: aErr }] = await Promise.all([
      supabase
        .from("survey_questions")
        .select("id, question_text, order_index")
        .eq("survey_id", surveyId),
      supabase
        .from("survey_answers")
        .select("question_id, response_id, answer_text, answer_value, selected_options")
        .in("response_id", responseIds),
    ]);

    if (qErr) throw new Error(`Gagal memuat questions: ${qErr.message}`);
    if (aErr) throw new Error(`Gagal memuat answers: ${aErr.message}`);

    const questionMap = new Map<string, QuestionRow>();
    (questions ?? []).forEach((q) => questionMap.set(q.id, q as QuestionRow));

    const answersByResponse = new Map<string, AnswerRow[]>();
    (answers ?? []).forEach((a) => {
      const list = answersByResponse.get(a.response_id) ?? [];
      list.push(a as AnswerRow);
      answersByResponse.set(a.response_id, list);
    });

    const formatted = responses.map((r) => {
      const rows = answersByResponse.get(r.id) ?? [];
      const obj: Record<string, unknown> = {};
      rows
        .sort((a, b) => (questionMap.get(a.question_id)?.order_index ?? 0) - (questionMap.get(b.question_id)?.order_index ?? 0))
        .forEach((a) => {
          const q = questionMap.get(a.question_id);
          const key = q?.question_text ?? a.question_id;
          const options = toOptionsArray(a.selected_options);
          obj[key] = options.length
            ? options
            : a.answer_text ?? a.answer_value ?? a.selected_options ?? null;
        });

      return {
        submitted_at: r.submitted_at,
        answers: obj,
      };
    });

    const prompt = buildPrompt(formatted);
    const summary = await callOpenRouter(prompt);

    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
