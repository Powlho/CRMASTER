import { NextRequest, NextResponse } from "next/server";
import { getReportFormat } from "@/lib/reportFormats";
import { getMeetingById } from "@/lib/data/store";
import { formatMeetingDate, transcriptAsText } from "@/lib/meetingText";
import { generateText } from "@/lib/llm";

const SUMMARY_INSTRUCTIONS =
  "Tu résumes des réunions professionnelles en français. Rédige un résumé sous forme de " +
  "liste à puces (une idée par ligne, commençant par « - »), de 3 à 10 points selon la " +
  "longueur : sujets abordés, décisions, points en suspens. Sois factuel et concis. " +
  "N'invente rien qui ne figure pas dans la transcription. Réponds uniquement par la liste.";

// Le résumé et le compte rendu sont générés à partir de la transcription enregistrée, avec
// les noms donnés aux intervenants (« Marie : … » plutôt que « Intervenant A : … »).
export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { meetingId, kind } = (await req.json()) as {
    meetingId?: string;
    kind?: "summary" | "report";
  };
  const meeting = meetingId ? await getMeetingById(meetingId, userId) : undefined;
  if (!meeting) return NextResponse.json({ error: "Réunion introuvable." }, { status: 404 });

  const transcript = transcriptAsText(meeting);
  if (!transcript.trim()) {
    return NextResponse.json({ error: "La transcription est vide." }, { status: 400 });
  }

  let instructions = SUMMARY_INSTRUCTIONS;
  let maxTokens = 800;
  if (kind === "report") {
    const format = getReportFormat(meeting.reportFormat);
    if (!format.prompt) {
      return NextResponse.json(
        { error: "Ce format ne nécessite pas de génération supplémentaire." },
        { status: 400 }
      );
    }
    instructions =
      format.prompt + " Rédige en texte simple (pas de Markdown : ni #, ni **), titres de section en majuscules.";
    maxTokens = 2500;
  }

  const content =
    `Réunion : ${meeting.title} (${formatMeetingDate(meeting)})\n` +
    (meeting.participants.trim() ? `Participants prévus : ${meeting.participants.trim()}\n` : "") +
    `\nTranscription :\n\n${transcript}`;

  const result = await generateText({ apiKey, instructions, content, maxTokens });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ text: result.text });
}
