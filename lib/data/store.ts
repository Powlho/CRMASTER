import { promises as fs } from "fs";
import path from "path";
import type { Meeting, NewMeetingInput } from "@/lib/types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "meetings.json");

let queue: Promise<unknown> = Promise.resolve();

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf-8");
  }
}

async function readAll(): Promise<Meeting[]> {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw) as Meeting[];
  } catch {
    return [];
  }
}

// Écriture atomique (fichier temporaire puis renommage) : une lecture concurrente voit
// l'ancien ou le nouveau contenu, jamais un fichier à moitié écrit.
async function writeAll(meetings: Meeting[]): Promise<void> {
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(meetings, null, 2), "utf-8");
  await fs.rename(tmp, DATA_FILE);
}

// Toutes les modifications passent par cette file : chaque lecture-modification-écriture
// s'exécute seule, sinon deux requêtes simultanées (ex. envoi audio + mise à jour du
// statut) pourraient s'écraser mutuellement.
function mutate<T>(fn: (meetings: Meeting[]) => { result: T; changed: boolean }): Promise<T> {
  const run = queue.then(async () => {
    const meetings = await readAll();
    const { result, changed } = fn(meetings);
    if (changed) await writeAll(meetings);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function listMeetings(userId: string): Promise<Meeting[]> {
  const meetings = await readAll();
  return meetings
    .filter((m) => m.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMeetingById(id: string, userId: string): Promise<Meeting | undefined> {
  const meetings = await readAll();
  return meetings.find((m) => m.id === id && m.userId === userId);
}

export function insertMeeting(input: NewMeetingInput, userId: string): Promise<Meeting> {
  const meeting: Meeting = {
    id: crypto.randomUUID(),
    userId,
    ...input,
    status: "planifiee",
    transcriptionStatus: "indisponible",
    notionStatus: "non_configure",
    recordingDurationSec: null,
    createdAt: new Date().toISOString(),
  };
  return mutate((meetings) => {
    meetings.push(meeting);
    return { result: meeting, changed: true };
  });
}

export function patchMeeting(
  id: string,
  userId: string,
  patch: Partial<Meeting>
): Promise<Meeting | undefined> {
  return mutate((meetings) => {
    const index = meetings.findIndex((m) => m.id === id && m.userId === userId);
    if (index === -1) return { result: undefined, changed: false };
    meetings[index] = { ...meetings[index], ...patch };
    return { result: meetings[index], changed: true };
  });
}

export function removeMeeting(id: string, userId: string): Promise<void> {
  return mutate((meetings) => {
    const index = meetings.findIndex((m) => m.id === id && m.userId === userId);
    if (index === -1) return { result: undefined, changed: false };
    meetings.splice(index, 1);
    return { result: undefined, changed: true };
  });
}

/**
 * Réunions créées avant l'introduction des comptes utilisateurs (pas de userId) : on les
 * rattache au compte admin plutôt que de les rendre invisibles à tout le monde.
 */
export function migrateOwnerlessMeetings(ownerId: string): Promise<void> {
  return mutate((meetings) => {
    let changed = false;
    for (const m of meetings) {
      if (!m.userId) {
        m.userId = ownerId;
        changed = true;
      }
    }
    return { result: undefined, changed };
  });
}

export async function listAllMeetings(): Promise<Meeting[]> {
  return readAll();
}

/**
 * Retire l'audio des réunions dont l'enregistrement date d'avant `cutoff` (transcriptions et
 * comptes rendus conservés). Renvoie les ids concernés, dont il faut supprimer les fichiers.
 */
export function detachExpiredAudio(cutoff: string): Promise<string[]> {
  return mutate((meetings) => {
    const expired: string[] = [];
    const now = new Date().toISOString();
    for (const m of meetings) {
      if (m.audio && m.audio.savedAt < cutoff) {
        delete m.audio;
        m.audioDeletedAt = now;
        expired.push(m.id);
      }
    }
    return { result: expired, changed: expired.length > 0 };
  });
}
