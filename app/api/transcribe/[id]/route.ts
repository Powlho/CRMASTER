import { NextRequest, NextResponse } from "next/server";

interface AssemblyAIUtterance {
  speaker: string;
  text: string;
}

interface AssemblyAITranscript {
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  summary: string | null;
  error: string | null;
  utterances: AssemblyAIUtterance[] | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${params.id}`, {
    headers: { authorization: apiKey },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Échec de la récupération du statut (${res.status}).` },
      { status: 502 }
    );
  }
  const data = (await res.json()) as AssemblyAITranscript;

  if (data.status === "error") {
    return NextResponse.json({
      status: "error",
      error: data.error || "La transcription a échoué côté AssemblyAI.",
    });
  }

  return NextResponse.json({
    status: data.status,
    text: data.text,
    summary: data.summary,
    utterances: data.utterances?.map((u) => ({ speaker: u.speaker, text: u.text })) ?? null,
  });
}
