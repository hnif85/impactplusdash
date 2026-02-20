import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CW_SUPER_TOKEN = process.env.CREATEWHIZ_SUPER_TOKEN;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const guid = url.searchParams.get("guid");

  if (!guid) {
    return NextResponse.json({ error: "guid is required" }, { status: 400 });
  }

  if (!CW_SUPER_TOKEN) {
    return NextResponse.json({ error: "Missing CREATEWHIZ_SUPER_TOKEN" }, { status: 500 });
  }

  try {
    const cwRes = await fetch(`https://createwhiz.ai/api/ext/deliverables/${guid}`, {
      headers: { "x-super-token": CW_SUPER_TOKEN },
      // avoid any caching on the server for fresh data
      cache: "no-store",
    });

    if (cwRes.ok) {
      const json = await cwRes.json();
      const deliverables = Array.isArray(json.deliverables) ? json.deliverables : [];
      return NextResponse.json({ deliverables, guid });
    }

    // If CW returns not found or other error, fall back to bundled sample so UI still renders.
    const fallbackPath = path.join(process.cwd(), "docs", "api_getimage.json");
    const raw = await fs.readFile(fallbackPath, "utf-8");
    const sample = JSON.parse(raw);
    return NextResponse.json(
      { deliverables: sample.deliverables ?? [], guid, source: "fallback-sample", error: await cwRes.text() },
      { status: cwRes.status }
    );
  } catch (error) {
    // On unexpected errors, also fall back to sample data.
    try {
      const fallbackPath = path.join(process.cwd(), "docs", "api_getimage.json");
      const raw = await fs.readFile(fallbackPath, "utf-8");
      const sample = JSON.parse(raw);
      return NextResponse.json(
        { deliverables: sample.deliverables ?? [], guid, source: "fallback-sample", error: error instanceof Error ? error.message : "Failed to fetch data" },
        { status: 502 }
      );
    } catch (inner) {
      return NextResponse.json(
        { error: inner instanceof Error ? inner.message : "Failed to read fallback data" },
        { status: 500 }
      );
    }
  }
}
