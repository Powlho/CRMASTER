import { promises as fs } from "fs";
import path from "path";

export interface AppSettings {
  /** Durée de conservation des fichiers audio, en jours. 0 = conservés indéfiniment. */
  audioRetentionDays: number;
}

export const RETENTION_CHOICES = [0, 30, 60, 90, 180, 365];

const DEFAULT_SETTINGS: AppSettings = { audioRetentionDays: 0 };

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

let writeQueue: Promise<unknown> = Promise.resolve();

export async function getSettings(): Promise<AppSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(SETTINGS_FILE, "utf-8")) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const run = writeQueue.then(async () => {
    const next = { ...(await getSettings()), ...patch };
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${SETTINGS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf-8");
    await fs.rename(tmp, SETTINGS_FILE);
    return next;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}
