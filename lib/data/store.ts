import { promises as fs } from "fs";
import path from "path";
import type { Meeting, NewMeetingInput } from "@/lib/types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "meetings.json");

let writeQueue: Promise<unknown> = Promise.resolve();

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

function writeAll(meetings: Meeting[]): Promise<void> {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DATA_FILE, JSON.stringify(meetings, null, 2), "utf-8")
  );
  return writeQueue as Promise<void>;
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

export async function insertMeeting(input: NewMeetingInput, userId: string): Promise<Meeting> {
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
  const meetings = await readAll();
  meetings.push(meeting);
  await writeAll(meetings);
  return meeting;
}

export async function patchMeeting(
  id: string,
  userId: string,
  patch: Partial<Meeting>
): Promise<Meeting | undefined> {
  const meetings = await readAll();
  const index = meetings.findIndex((m) => m.id === id && m.userId === userId);
  if (index === -1) return undefined;
  meetings[index] = { ...meetings[index], ...patch };
  await writeAll(meetings);
  return meetings[index];
}

export async function removeMeeting(id: string, userId: string): Promise<void> {
  const meetings = await readAll();
  await writeAll(meetings.filter((m) => !(m.id === id && m.userId === userId)));
}

/**
 * Réunions créées avant l'introduction des comptes utilisateurs (pas de userId) : on les
 * rattache au compte admin plutôt que de les rendre invisibles à tout le monde.
 */
export async function migrateOwnerlessMeetings(ownerId: string): Promise<void> {
  const meetings = await readAll();
  let changed = false;
  for (const m of meetings) {
    if (!m.userId) {
      m.userId = ownerId;
      changed = true;
    }
  }
  if (changed) await writeAll(meetings);
}
