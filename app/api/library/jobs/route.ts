import { NextRequest, NextResponse } from "next/server";
import { dismissJob, listJobs, startDownload } from "@/lib/data/library";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  return NextResponse.json({ jobs: listJobs(userId) });
}

// Lance le téléchargement de l'audio d'une vidéo (YouTube, Vimeo, Dailymotion…) via yt-dlp.
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  let url: URL;
  try {
    url = new URL(String(body.url ?? "").trim());
  } catch {
    return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "Seuls les liens http(s) sont acceptés." }, { status: 400 });
  }
  const job = await startDownload(url.toString(), userId);
  return NextResponse.json({ job });
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (id) dismissJob(id, userId);
  return NextResponse.json({ ok: true });
}
