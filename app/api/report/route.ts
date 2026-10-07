import { NextRequest, NextResponse } from "next/server";
import { getReportFormat } from "@/lib/reportFormats";
import { getMeetingById, patchMeeting } from "@/lib/data/store";
import { formatMeetingDate, transcriptAsText } from "@/lib/meetingText";
import { generateText } from "@/lib/llm";
import type { Meeting } from "@/lib/types";

export const dynamic = "force-dynamic";

const SUMMARY_INSTRUCTIONS =
  "Tu résumes des réunions professionnelles en français. Rédige un résumé sous forme de " +
  "liste à puces (une idée par ligne, commençant par « - »), de 3 à 10 points selon la " +
  "longueur : sujets abordés, décisions, points en suspens. Sois factuel et concis. " +
  "N'invente rien qui ne figure pas dans la transcription. Réponds uniquement par la liste.";

type Kind = "summary" | "report";

interface Job {
  status: "running" | "done" | "error";
  error?: string;
}

// La génération d'un compte rendu sur une longue réunion peut prendre plus d'une minute :
// trop pour attendre la réponse dans une seule requête (Nginx coupe à 60 s par défaut).
// Elle tourne donc en tâche de fond ; la page interroge l'état (GET) jusqu'au résultat,
// qui est enregistré dans la réunion — même si la page a été fermée entre-temps.
const jobs = new Map<string, Job>();

function jobKey(meetingId: string, kind: Kind) {
  return `${meetingId}:${kind}`;
}

function parseKind(raw: unknown): Kind | null {
  return raw === "summary" || raw === "report" ? raw : null;
}

async function runJob(apiKey: string, meeting: Meeting, userId: string, kind: Kind) {
  const key = jobKey(meeting.id, kind);
  try {
    let instructions = SUMMARY_INSTRUCTIONS;
    let maxTokens = 800;
    if (kind === "report") {
      instructions =
        (getReportFormat(meeting.reportFormat).prompt ?? "") +
        " Rédige en texte simple (pas de Markdown : ni #, ni **), titres de section en majuscules.";
      maxTokens = 2500;
    }
    const content =
      `Réunion : ${meeting.title} (${formatMeetingDate(meeting)})\n` +
      (meeting.participants.trim()
        ? `Participants prévus : ${meeting.participants.trim()}\n`
        : "") +
      `\nTranscription :\n\n${transcriptAsText(meeting)}`;

    const result = await generateText({ apiKey, instructions, content, maxTokens });
    if ("error" in result) {
      console.error(`[report] ${kind} ${meeting.id} : ${result.error}`);
      jobs.set(key, { status: "error", error: result.error });
      return;
    }
    await patchMeeting(
      meeting.id,
      userId,
      kind === "summary" ? { transcriptSummary: result.text } : { formattedReport: result.text }
    );
    jobs.set(key, { status: "done" });
  } catch (err) {
    console.error(`[report] ${kind} ${meeting.id} :`, err);
    jobs.set(key, { status: "error", error: "Erreur interne pendant la génération." });
  }
}

async function load(req: NextRequest, meetingId: unknown) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  const meeting =
    typeof meetingId === "string" ? await getMeetingById(meetingId, userId) : undefined;
  if (!meeting) {
    return { error: NextResponse.json({ error: "Réunion introuvable." }, { status: 404 }) };
  }
  return { meeting, userId };
}

/** Lance la génération (ou constate qu'elle tourne déjà). Réponse immédiate. */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASSEMBLYAI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as { meetingId?: unknown; kind?: unknown };
  const kind = parseKind(body.kind);
  if (!kind) return NextResponse.json({ error: "Type de génération inconnu." }, { status: 400 });
  const found = await load(req, body.meetingId);
  if (found.error) return found.error;
  const { meeting, userId } = found;

  if (!transcriptAsText(meeting).trim()) {
    return NextResponse.json({ error: "La transcription est vide." }, { status: 400 });
  }
  if (kind === "report" && !getReportFormat(meeting.reportFormat).prompt) {
    return NextResponse.json(
      { error: "Ce format ne nécessite pas de génération supplémentaire." },
      { status: 400 }
    );
  }

  const key = jobKey(meeting.id, kind);
  if (jobs.get(key)?.status !== "running") {
    jobs.set(key, { status: "running" });
    void runJob(apiKey, meeting, userId, kind);
  }
  return NextResponse.json({ status: "running" }, { status: 202 });
}

/** État de la génération ; une fois terminée, renvoie la réunion à jour. */
export async function GET(req: NextRequest) {
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  if (!kind) return NextResponse.json({ error: "Type de génération inconnu." }, { status: 400 });
  const found = await load(req, req.nextUrl.searchParams.get("meetingId"));
  if (found.error) return found.error;

  const key = jobKey(found.meeting.id, kind);
  const job = jobs.get(key);
  if (!job) return NextResponse.json({ status: "idle" });
  if (job.status === "running") return NextResponse.json({ status: "running" });
  jobs.delete(key);
  if (job.status === "error") return NextResponse.json({ status: "error", error: job.error });
  return NextResponse.json({ status: "done", meeting: found.meeting });
}
