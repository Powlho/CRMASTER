import { NextRequest, NextResponse } from "next/server";
import { getMeetingById, patchMeeting } from "@/lib/data/store";

interface AssemblyAIUtterance {
  speaker: string;
  text: string;
}

interface AssemblyAITranscript {
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  error: string | null;
  utterances: AssemblyAIUtterance[] | null;
}

export const dynamic = "force-dynamic";

// Suivi d'une transcription. Quand elle est terminée, le serveur l'enregistre lui-même dans
// la réunion : le résumé et le compte rendu, générés ensuite à partir de la réunion
// enregistrée, partent ainsi toujours du bon texte.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const meetingId = req.nextUrl.searchParams.get("meetingId") ?? "";
  const meeting = meetingId ? await getMeetingById(meetingId, userId) : undefined;
  if (!meeting || meeting.assemblyTranscriptId !== params.id) {
    return NextResponse.json({ error: "Transcription introuvable." }, { status: 404 });
  }
  // Déjà enregistrée (autre onglet, double appel) : rien à refaire.
  if (meeting.transcriptionStatus === "terminee") {
    return NextResponse.json({ status: "completed", meeting });
  }

  const res = await fetch(
    `https://api.assemblyai.com/v2/transcript/${encodeURIComponent(params.id)}`,
    // Sans no-store, Next.js garderait en cache la première réponse (« en cours ») et la
    // transcription ne se terminerait jamais côté application.
    { headers: { authorization: apiKey }, cache: "no-store" }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: `Échec de la récupération du statut (${res.status}).` },
      { status: 502 }
    );
  }
  const data = (await res.json()) as AssemblyAITranscript;

  if (data.status === "error") {
    const updated = await patchMeeting(meeting.id, userId, {
      transcriptionStatus: "en_attente_outil",
    });
    return NextResponse.json({
      status: "error",
      error: data.error || "La transcription a échoué côté AssemblyAI.",
      meeting: updated,
    });
  }

  if (data.status === "completed") {
    // Nouvelle transcription : le résumé, le compte rendu et les noms de la précédente ne
    // correspondent plus forcément.
    const updated = await patchMeeting(meeting.id, userId, {
      transcriptionStatus: "terminee",
      transcriptText: data.text ?? "",
      transcriptUtterances:
        data.utterances?.map((u) => ({ speaker: u.speaker, text: u.text })) ?? undefined,
      transcriptSummary: undefined,
      formattedReport: undefined,
      speakerNames: undefined,
      notionStatus: "a_envoyer",
    });
    return NextResponse.json({ status: "completed", meeting: updated });
  }

  return NextResponse.json({ status: data.status });
}
