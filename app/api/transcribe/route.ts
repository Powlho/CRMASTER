import { NextRequest, NextResponse } from "next/server";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
  }

  const audioBuffer = await audio.arrayBuffer();

  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: { authorization: apiKey },
    body: audioBuffer,
  });
  if (!uploadRes.ok) {
    return NextResponse.json(
      { error: `Échec de l'envoi de l'audio vers AssemblyAI (${uploadRes.status}).` },
      { status: 502 }
    );
  }
  const { upload_url: uploadUrl } = (await uploadRes.json()) as { upload_url: string };

  const transcriptRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: "POST",
    headers: { authorization: apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: uploadUrl,
      language_code: "fr",
      summarization: true,
      summary_model: "informative",
      summary_type: "bullets",
    }),
  });
  if (!transcriptRes.ok) {
    return NextResponse.json(
      { error: `Échec du lancement de la transcription (${transcriptRes.status}).` },
      { status: 502 }
    );
  }
  const transcript = (await transcriptRes.json()) as { id: string };

  return NextResponse.json({ transcriptId: transcript.id });
}
