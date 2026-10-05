import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const AUDIO_DIR = path.join(DATA_DIR, "audio");

// Types acceptés à l'envoi et seuls types renvoyés tels quels à la lecture : le type stocké
// ne doit jamais permettre de servir autre chose que de l'audio (ex. text/html).
export const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const MEETING_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export function normalizeAudioType(raw: string | null): string | null {
  const type = (raw ?? "").split(";")[0].trim().toLowerCase();
  return type in AUDIO_EXTENSIONS ? type : null;
}

// Le chemin dérive uniquement de l'id de la réunion, jamais d'un champ modifiable par le client.
export function audioPath(meetingId: string): string {
  if (!MEETING_ID_PATTERN.test(meetingId)) {
    throw new Error("Identifiant de réunion invalide.");
  }
  return path.join(AUDIO_DIR, meetingId);
}

export async function ensureAudioDir(): Promise<void> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function deleteMeetingAudio(meetingId: string): Promise<void> {
  await fs.unlink(audioPath(meetingId)).catch(() => {});
}
