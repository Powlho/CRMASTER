import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { audioFilePath, getAudioFile } from "@/lib/server/audioLibrary";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

export async function POST(req: NextRequest) {
  try {
    return await startTranscription(req);
  } catch (err) {
    console.error("Lancement de la transcription échoué :", err);
    return NextResponse.json(
      { error: `Échec du lancement de la transcription : ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

async function startTranscription(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  // Deux sources possibles : un fichier de la bibliothèque audio du serveur ({ audioId }),
  // ou un fichier envoyé directement en multipart (champ « audio »).
  let body: BodyInit;
  let contentLength: string | undefined;
  if (req.headers.get("content-type")?.includes("application/json")) {
    const { audioId } = (await req.json().catch(() => ({}))) as { audioId?: string };
    const file = audioId ? await getAudioFile(audioId) : null;
    if (!file) {
      return NextResponse.json({ error: "Fichier audio introuvable sur le serveur." }, { status: 404 });
    }
    const filePath = audioFilePath(file);
    contentLength = String((await fs.stat(filePath)).size);
    body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  } else {
    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
    }
    body = await audio.arrayBuffer();
  }

  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/octet-stream",
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
    body,
    // Requis par Node pour envoyer un flux en corps de requête.
    duplex: "half",
  } as RequestInit);
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
