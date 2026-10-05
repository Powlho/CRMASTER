import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getTranscriptionProfile } from "@/lib/transcriptionProfiles";
import { getMeetingById } from "@/lib/data/store";
import { audioPath } from "@/lib/data/audio";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

// La transcription part du fichier audio stocké sur le serveur : le navigateur n'a pas à
// renvoyer l'enregistrement, et on peut relancer une transcription à tout moment.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { meetingId } = (await req.json()) as { meetingId?: string };
  const meeting = meetingId ? await getMeetingById(meetingId, userId) : undefined;
  if (!meeting) {
    return NextResponse.json({ error: "Réunion introuvable." }, { status: 404 });
  }
  if (!meeting.audio) {
    return NextResponse.json(
      { error: "Aucun enregistrement audio sauvegardé pour cette réunion." },
      { status: 400 }
    );
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = await fs.readFile(audioPath(meeting.id));
  } catch {
    return NextResponse.json(
      { error: "Fichier audio introuvable sur le serveur." },
      { status: 404 }
    );
  }

  const profile = getTranscriptionProfile(meeting.transcriptionProfile);
  const speakersExpected = meeting.speakersExpected;
  const hasSpeakersHint =
    typeof speakersExpected === "number" &&
    Number.isInteger(speakersExpected) &&
    speakersExpected >= 1 &&
    speakersExpected <= 10;

  const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
    method: "POST",
    headers: { authorization: apiKey },
    body: audioBuffer as unknown as BodyInit,
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
      speaker_labels: true,
      ...(hasSpeakersHint ? { speakers_expected: speakersExpected } : {}),
      ...(profile.words.length > 0
        ? { word_boost: profile.words, boost_param: "high" }
        : {}),
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
