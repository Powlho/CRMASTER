import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { AudioDownloadJob, LibraryFile } from "@/lib/types";

// Bibliothèque audio : pistes récupérées depuis YouTube et autres plateformes (yt-dlp),
// propres à chaque compte, utilisables comme audio d'une réunion.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const LIBRARY_DIR = path.join(DATA_DIR, "library");
const LEGACY_AUDIO_DIR = path.join(DATA_DIR, "audio");

const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

// Cookies YouTube (format Netscape) : nécessaires quand YouTube bloque l'IP du serveur
// (« Sign in to confirm you're not a bot »). Partagés par tous les comptes.
export const COOKIES_FILE = path.resolve(
  process.env.YTDLP_COOKIES_FILE || path.join(DATA_DIR, "youtube-cookies.txt")
);

const ID_PATTERN = /^[0-9a-f-]{36}$/;

// Types servis à la lecture et acceptés comme audio de réunion (voir lib/audioTypes.ts).
const MIME_BY_EXT: Record<string, string> = {
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
};

export function libraryMimeType(file: LibraryFile): string | null {
  return MIME_BY_EXT[file.fileName.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

function metaPath(id: string) {
  return path.join(LIBRARY_DIR, `${id}.json`);
}

export function libraryFilePath(file: LibraryFile) {
  return path.join(LIBRARY_DIR, path.basename(file.fileName));
}

async function ensureDir() {
  await fs.mkdir(LIBRARY_DIR, { recursive: true });
}

async function writeMeta(file: LibraryFile) {
  await fs.writeFile(metaPath(file.id), JSON.stringify(file, null, 2));
}

async function readMeta(id: string): Promise<LibraryFile | null> {
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf8")) as LibraryFile;
  } catch {
    return null;
  }
}

/**
 * Une première version rangeait la bibliothèque dans data/audio (le dossier des audios de
 * réunions), sans notion de compte : on déplace ces fichiers et on les rattache au compte
 * qui ouvre la bibliothèque en premier.
 */
async function migrateLegacyFiles(userId: string) {
  let names: string[];
  try {
    names = await fs.readdir(LEGACY_AUDIO_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(LEGACY_AUDIO_DIR, name), "utf8")
      ) as LibraryFile;
      if (!meta.fileName || !("source" in meta)) continue;
      await ensureDir();
      await fs.rename(
        path.join(LEGACY_AUDIO_DIR, path.basename(meta.fileName)),
        path.join(LIBRARY_DIR, path.basename(meta.fileName))
      );
      await writeMeta({ ...meta, userId: meta.userId || userId });
      await fs.rm(path.join(LEGACY_AUDIO_DIR, name), { force: true });
    } catch {
      // fichier incomplet : laissé en place
    }
  }
}

export async function listLibrary(userId: string): Promise<LibraryFile[]> {
  await migrateLegacyFiles(userId);
  await ensureDir();
  const files = await Promise.all(
    (await fs.readdir(LIBRARY_DIR))
      .filter((name) => name.endsWith(".json"))
      .map((name) => readMeta(name.slice(0, -".json".length)))
  );
  return files
    .filter((f): f is LibraryFile => f !== null && f.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLibraryFile(id: string, userId: string): Promise<LibraryFile | null> {
  if (!ID_PATTERN.test(id)) return null;
  const file = await readMeta(id);
  return file && file.userId === userId ? file : null;
}

export async function deleteLibraryFile(id: string, userId: string): Promise<boolean> {
  const file = await getLibraryFile(id, userId);
  if (!file) return false;
  await fs.rm(libraryFilePath(file), { force: true });
  await fs.rm(metaPath(id), { force: true });
  return true;
}

// --- Cookies YouTube ------------------------------------------------------------------

export async function getCookiesStatus() {
  try {
    const stat = await fs.stat(COOKIES_FILE);
    return { configured: true, updatedAt: stat.mtime.toISOString() };
  } catch {
    return { configured: false, updatedAt: null };
  }
}

export async function saveCookies(content: string) {
  await fs.mkdir(path.dirname(COOKIES_FILE), { recursive: true });
  await fs.writeFile(COOKIES_FILE, content, { mode: 0o600 });
}

export async function deleteCookies() {
  await fs.rm(COOKIES_FILE, { force: true });
}

// --- Téléchargements via yt-dlp -------------------------------------------------------

// Les jobs vivent en mémoire du process Node (un seul process PM2) ; on les accroche à
// globalThis pour qu'ils survivent au rechargement à chaud en développement.
const globalJobs = globalThis as unknown as { __crmasterJobs?: Map<string, AudioDownloadJob> };
const jobs = (globalJobs.__crmasterJobs ??= new Map<string, AudioDownloadJob>());

export function listJobs(userId: string): AudioDownloadJob[] {
  return Array.from(jobs.values())
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function dismissJob(id: string, userId: string) {
  const job = jobs.get(id);
  if (job && job.userId === userId && job.status !== "running") jobs.delete(id);
}

const PRINT_SEPARATOR = "\u001f";

export async function startDownload(url: string, userId: string): Promise<AudioDownloadJob> {
  await ensureDir();
  const id = randomUUID();
  const job: AudioDownloadJob = {
    id,
    userId,
    url,
    status: "running",
    progress: 0,
    title: null,
    error: null,
    audioId: null,
    startedAt: new Date().toISOString(),
  };
  jobs.set(id, job);

  const args = [
    "--no-playlist",
    "--newline",
    "--progress",
    "--no-simulate",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "m4a",
    "-o",
    path.join(LIBRARY_DIR, `${id}.%(ext)s`),
    "--print",
    `after_move:${["%(title)s", "%(duration)s", "%(extractor_key)s", "%(webpage_url)s", "%(filepath)s"].join(PRINT_SEPARATOR)}`,
  ];
  if ((await getCookiesStatus()).configured) {
    args.push("--cookies", COOKIES_FILE);
  }
  if (process.env.YTDLP_EXTRA_ARGS) {
    args.push(...process.env.YTDLP_EXTRA_ARGS.split(/\s+/).filter(Boolean));
  }
  args.push("--", url);

  const child = spawn(YTDLP_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });

  let printed: string | null = null;
  let stderrTail = "";

  const onLine = (line: string) => {
    const progress = line.match(/^\[download\]\s+([\d.]+)%/);
    if (progress) {
      job.progress = Math.min(99, parseFloat(progress[1]));
      return;
    }
    if (line.includes(PRINT_SEPARATOR)) printed = line;
  };

  let stdoutBuffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    lines.forEach(onLine);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  child.on("error", (err: NodeJS.ErrnoException) => {
    job.status = "error";
    job.error =
      err.code === "ENOENT"
        ? "yt-dlp n'est pas installé sur le serveur (voir deploy/update.sh)."
        : `Erreur yt-dlp : ${err.message}`;
  });

  child.on("close", async (code) => {
    if (stdoutBuffer) onLine(stdoutBuffer);
    if (job.status === "error") return;
    if (code !== 0 || !printed) {
      job.status = "error";
      const lastError = stderrTail
        .split("\n")
        .reverse()
        .find((l) => l.startsWith("ERROR"));
      job.error =
        lastError?.replace(/;? please report this issue[\s\S]*$/, "") ||
        `Le téléchargement a échoué (code ${code}).`;
      if (/confirm you.re not a bot|cookies/i.test(job.error)) {
        job.error =
          "YouTube bloque le serveur (« confirmez que vous n'êtes pas un robot »). Ajoutez ou renouvelez les cookies YouTube ci-dessous, puis réessayez.";
      }
      return;
    }
    try {
      const [title, duration, extractor, webpageUrl, filepath] = (printed as string).split(
        PRINT_SEPARATOR
      );
      const fileName = path.basename(filepath);
      const stat = await fs.stat(path.join(LIBRARY_DIR, fileName));
      const durationNum = Number(duration);
      const file: LibraryFile = {
        id,
        userId,
        title: title && title !== "NA" ? title : url,
        sourceUrl: webpageUrl && webpageUrl !== "NA" ? webpageUrl : url,
        platform: extractor && extractor !== "NA" ? extractor : null,
        durationSec: Number.isFinite(durationNum) ? Math.round(durationNum) : null,
        fileName,
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
      };
      await writeMeta(file);
      job.title = file.title;
      job.audioId = id;
      job.progress = 100;
      job.status = "done";
    } catch (err) {
      job.status = "error";
      job.error = `Fichier téléchargé introuvable : ${(err as Error).message}`;
    }
  });

  return job;
}
