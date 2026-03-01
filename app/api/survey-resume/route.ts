import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type IncomingAnswer = {
  question_text: string;
  answer_text: string | null;
  answer_value: string | number | null;
  selected_options?: string[];
};

export async function POST(req: Request) {
  try {
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 503 });
    }

    const body = (await req.json()) as {
      answers: IncomingAnswer[];
      guid?: string | null;
      profile?: { name?: string | null; email?: string | null; phone?: string | null };
    };

    const answers = body.answers ?? [];
    const customerGuid = body.guid ?? null;

    if (customerGuid) {
      const { data: cached, error: cacheErr } = await supabase
        .from("survey_resumes")
        .select("resume_text")
        .eq("customer_guid", customerGuid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cacheErr) {
        console.error("Failed to read resume cache", cacheErr);
      } else if (cached?.resume_text) {
        return NextResponse.json({ resume: cached.resume_text });
      }
    }

    const formatted = answers
      .map((a, idx) => {
        const val =
          a.selected_options?.length
            ? a.selected_options.join(", ")
            : a.answer_text ?? (a.answer_value !== null && a.answer_value !== undefined ? String(a.answer_value) : "-");
        return `${idx + 1}. ${a.question_text}: ${val}`;
      })
      .join("\n");

    const prompt = `
Anda adalah asisten yang merangkum hasil kuesioner UMKM berbahasa Indonesia.
Tulis resume naratif maksimal 300 kata tentang customer ini.
Gunakan poin penting (brand, jenis usaha, lama berjalan, omzet, karyawan, tantangan, platform promosi, pencatatan, skor/kesiapan) jika tersedia.
Jangan sertakan timestamp. Gunakan nada ringkas dan positif, tapi faktual.

Nama: ${body.profile?.name ?? "-"}
Email: ${body.profile?.email ?? "-"}
Telepon/WA: ${body.profile?.phone ?? "-"}

Data kuesioner:
${formatted}

format output berupa narasi, bukan daftar dengan data yang lengkap. Jangan buat kesimpulan atau rekomendasi, cukup rangkum data di atas dengan gaya bahasa yang menarik dan mudah dipahami.
`;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Impact Dashboard",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a helpful assistant who summarizes Indonesian SME surveys." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 700,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return NextResponse.json({ error: `OpenRouter error: ${errText}` }, { status: 502 });
    }

    const data = await resp.json();
    const resume = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (customerGuid && resume) {
      const { error: insertErr } = await supabase.from("survey_resumes").insert({
        customer_guid: customerGuid,
        resume_text: resume,
        model: MODEL,
        profile_email: body.profile?.email ?? null,
        profile_name: body.profile?.name ?? null,
      });
      if (insertErr) {
        console.error("Failed to store resume cache", insertErr);
      }
    }

    return NextResponse.json({ resume });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
