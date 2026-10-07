import { NextRequest, NextResponse } from "next/server";
import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { getTranscriptionProfile } from "@/lib/transcriptionProfiles";
import { getMeetingById, patchMeeting } from "@/lib/data/store";
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

  const filePath = audioPath(meeting.id);
  try {
    await fs.access(filePath);
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

  // Envoi en flux : un enregistrement Teams importé peut peser plusieurs centaines de Mo,
  // inutile de le charger en mémoire.
  let uploadRes: Response;
  try {
    uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
      method: "POST",
      headers: { authorization: apiKey, "content-type": "application/octet-stream" },
      body: Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre AssemblyAI depuis le serveur." },
      { status: 502 }
    );
  }
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
      // Universal-3 Pro (meilleure précision, français inclus), avec repli automatique sur
      // Universal-2 si besoin.
      speech_models: ["universal-3-pro", "universal-2"],
      language_code: "fr",
      speaker_labels: true,
      ...(hasSpeakersHint ? { speakers_expected: speakersExpected } : {}),
      // Vocabulaire du profil (remplace word_boost, obsolète). Le résumé n'est plus demandé
      // ici (paramètres retirés par AssemblyAI) : il est généré ensuite, voir /api/report.
      ...(profile.words.length > 0 ? { keyterms_prompt: profile.words.slice(0, 1000) } : {}),
    }),
  });
  if (!transcriptRes.ok) {
    const detail = (await transcriptRes.text()).slice(0, 300);
    return NextResponse.json(
      { error: `Échec du lancement de la transcription (${transcriptRes.status}) : ${detail}` },
      { status: 502 }
    );
  }
  const transcript = (await transcriptRes.json()) as { id: string };

  // Enregistré côté serveur : si la page est fermée maintenant, le suivi reprend au retour.
  const updated = await patchMeeting(meeting.id, userId, {
    transcriptionStatus: "en_cours",
    assemblyTranscriptId: transcript.id,
  });
  return NextResponse.json({ transcriptId: transcript.id, meeting: updated });
}
