import { promises as fs } from "fs";
import path from "path";
import type { Meeting, MeetingAudio } from "@/lib/types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");

export { AUDIO_EXTENSIONS, normalizeAudioType } from "@/lib/audioTypes";

const MEETING_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const SESSION_PATTERN = /^[A-Za-z0-9]{8,40}$/;

// Le chemin dérive uniquement de l'id de la réunion, jamais d'un champ modifiable par le client.
export function audioPath(meetingId: string): string {
  if (!MEETING_ID_PATTERN.test(meetingId)) {
    throw new Error("Identifiant de réunion invalide.");
  }
  return path.join(AUDIO_DIR, meetingId);
}

export function isValidSession(session: string | null): session is string {
  return Boolean(session && SESSION_PATTERN.test(session));
}

/** Fichier où s'accumulent les morceaux envoyés pendant un enregistrement en cours. */
export function livePartPath(meetingId: string, session: string): string {
  if (!SESSION_PATTERN.test(session)) throw new Error("Session d'enregistrement invalide.");
  return `${audioPath(meetingId)}.${session}.part`;
}

/** Type audio de l'enregistrement en cours, noté au premier morceau reçu. */
export function livePartTypePath(meetingId: string, session: string): string {
  return `${livePartPath(meetingId, session)}.type`;
}

export interface LivePart {
  session: string;
  size: number;
  updatedAt: string;
}

export async function listLiveParts(meetingId: string): Promise<LivePart[]> {
  const prefix = `${path.basename(audioPath(meetingId))}.`;
  let names: string[];
  try {
    names = await fs.readdir(AUDIO_DIR);
  } catch {
    return [];
  }
  const parts: LivePart[] = [];
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".part")) continue;
    const session = name.slice(prefix.length, -".part".length);
    if (!SESSION_PATTERN.test(session)) continue;
    try {
      const stat = await fs.stat(path.join(AUDIO_DIR, name));
      parts.push({ session, size: stat.size, updatedAt: stat.mtime.toISOString() });
    } catch {
      // supprimé entre-temps
    }
  }
  return parts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteLivePart(meetingId: string, session: string): Promise<void> {
  await fs.unlink(livePartPath(meetingId, session)).catch(() => {});
  await fs.unlink(livePartTypePath(meetingId, session)).catch(() => {});
}

export async function ensureAudioDir(): Promise<void> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function deleteMeetingAudio(meetingId: string): Promise<void> {
  await fs.unlink(audioPath(meetingId)).catch(() => {});
  for (const part of await listLiveParts(meetingId)) {
    await deleteLivePart(meetingId, part.session);
  }
}

/**
 * Champs à appliquer quand une réunion reçoit un nouvel audio : la transcription, le compte
 * rendu et les noms d'intervenants de l'audio précédent ne correspondent plus, on repart à zéro.
 */
export function newAudioPatch(audio: MeetingAudio, durationSec: number | null): Partial<Meeting> {
  return {
    audio,
    audioDeletedAt: undefined,
    status: "enregistree",
    recordingDurationSec: durationSec,
    transcriptionStatus: "en_attente_outil",
    assemblyTranscriptId: undefined,
    transcriptText: undefined,
    transcriptSummary: undefined,
    transcriptUtterances: undefined,
    formattedReport: undefined,
    speakerNames: undefined,
    notionStatus: "non_configure",
    notionPageUrl: undefined,
  };
}

export function parseDuration(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 60 * 60 * 24
    ? Math.round(n)
    : null;
}
