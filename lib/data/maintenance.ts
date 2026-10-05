import { promises as fs } from "fs";
import path from "path";
import { AUDIO_DIR, audioPath } from "@/lib/data/audio";
import { getSettings } from "@/lib/data/settings";
import { detachExpiredAudio } from "@/lib/data/store";

const DAY_MS = 24 * 60 * 60 * 1000;
// Enregistrements interrompus jamais récupérés, et envois incomplets abandonnés.
const STALE_PART_DAYS = 14;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface MaintenanceReport {
  deletedAudio: number;
  deletedParts: number;
}

export async function runMaintenance(): Promise<MaintenanceReport> {
  const report: MaintenanceReport = { deletedAudio: 0, deletedParts: 0 };

  const { audioRetentionDays } = await getSettings();
  if (audioRetentionDays > 0) {
    const cutoff = new Date(Date.now() - audioRetentionDays * DAY_MS).toISOString();
    // La réunion est mise à jour d'abord : au pire il reste un fichier orphelin, jamais une
    // réunion qui pointe vers un fichier supprimé.
    for (const id of await detachExpiredAudio(cutoff)) {
      await fs.unlink(audioPath(id)).catch(() => {});
      report.deletedAudio++;
    }
  }

  let names: string[] = [];
  try {
    names = await fs.readdir(AUDIO_DIR);
  } catch {
    // pas encore de dossier audio
  }
  const staleBefore = Date.now() - STALE_PART_DAYS * DAY_MS;
  for (const name of names) {
    if (!/\.(part|part\.type|upload)$/.test(name)) continue;
    const file = path.join(AUDIO_DIR, name);
    try {
      if ((await fs.stat(file)).mtimeMs < staleBefore) {
        await fs.unlink(file);
        if (!name.endsWith(".type")) report.deletedParts++;
      }
    } catch {
      // déjà supprimé
    }
  }
  return report;
}

export async function audioUsage(): Promise<{
  files: number;
  bytes: number;
  diskFreeBytes: number | null;
}> {
  let files = 0;
  let bytes = 0;
  try {
    for (const name of await fs.readdir(AUDIO_DIR)) {
      const stat = await fs.stat(path.join(AUDIO_DIR, name)).catch(() => null);
      if (stat?.isFile()) {
        files += name.includes(".") ? 0 : 1;
        bytes += stat.size;
      }
    }
  } catch {
    // pas encore de dossier audio
  }
  let diskFreeBytes: number | null = null;
  try {
    const stat = await fs.statfs(path.dirname(AUDIO_DIR));
    diskFreeBytes = stat.bavail * stat.bsize;
  } catch {
    // statfs indisponible
  }
  return { files, bytes, diskFreeBytes };
}

let started = false;

/** Lancée une fois au démarrage du serveur (voir instrumentation.ts). */
export function startMaintenance(): void {
  if (started) return;
  started = true;
  const run = () => {
    runMaintenance()
      .then((r) => {
        if (r.deletedAudio || r.deletedParts) {
          console.log(
            `[maintenance] ${r.deletedAudio} audio(s) expiré(s) et ${r.deletedParts} envoi(s) abandonné(s) supprimés`
          );
        }
      })
      .catch((err) => console.error("[maintenance] échec :", err));
  };
  setTimeout(run, 60 * 1000);
  setInterval(run, INTERVAL_MS).unref();
}
