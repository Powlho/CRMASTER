import { NextRequest, NextResponse } from "next/server";
import { getReportFormat } from "@/lib/reportFormats";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  const { transcriptId, formatId } = (await req.json()) as {
    transcriptId?: string;
    formatId?: string;
  };
  if (!transcriptId) {
    return NextResponse.json({ error: "transcriptId manquant." }, { status: 400 });
  }

  const format = getReportFormat(formatId);
  if (!format.prompt) {
    return NextResponse.json(
      { error: "Ce format ne nécessite pas de génération supplémentaire." },
      { status: 400 }
    );
  }

  const res = await fetch("https://api.assemblyai.com/lemur/v3/generate/task", {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      transcript_ids: [transcriptId],
      prompt: format.prompt,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return NextResponse.json(
      { error: `Échec de la génération du compte rendu (${res.status}): ${errBody}` },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { response: string };
  return NextResponse.json({ report: data.response });
}
