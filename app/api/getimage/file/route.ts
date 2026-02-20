import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const target = urlObj.searchParams.get("url");
  if (!target) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try {
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const arrayBuffer = await res.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=600",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fetch failed" }, { status: 500 });
  }
}
