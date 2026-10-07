import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { AudioDownloadJob, AudioFile } from "@/lib/types";

// Dossier de stockage des fichiers audio sur le serveur (VPS).
export const AUDIO_DIR = path.resolve(
  process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), "data", "audio")
);

const YTDLP_PATH = process.env.YTDLP_PATH || "yt-dlp";

// Cookies YouTube (format Netscape) : nécessaires quand YouTube bloque l'IP du serveur
// (« Sign in to confirm you're not a bot »). Envoyés depuis la Bibliothèque audio.
export const COOKIES_FILE = path.resolve(
  process.env.YTDLP_COOKIES_FILE || path.join(process.cwd(), "data", "youtube-cookies.txt")
);

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

const ID_PATTERN = /^[0-9a-f-]{36}$/;

export function isValidAudioId(id: string) {
  return ID_PATTERN.test(id);
}

function metaPath(id: string) {
  return path.join(AUDIO_DIR, `${id}.json`);
}

async function ensureDir() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
}

export async function listAudioFiles(): Promise<AudioFile[]> {
  await ensureDir();
  const entries = await fs.readdir(AUDIO_DIR);
  const files = await Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          return JSON.parse(await fs.readFile(path.join(AUDIO_DIR, name), "utf8")) as AudioFile;
        } catch {
          return null;
        }
      })
  );
  return files
    .filter((f): f is AudioFile => f !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAudioFile(id: string): Promise<AudioFile | null> {
  if (!isValidAudioId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf8")) as AudioFile;
  } catch {
    return null;
  }
}

export function audioFilePath(file: AudioFile) {
  return path.join(AUDIO_DIR, file.fileName);
}

export async function deleteAudioFile(id: string) {
  const file = await getAudioFile(id);
  if (!file) return false;
  await fs.rm(audioFilePath(file), { force: true });
  await fs.rm(metaPath(id), { force: true });
  return true;
}

async function writeMeta(file: AudioFile) {
  await fs.writeFile(metaPath(file.id), JSON.stringify(file, null, 2));
}

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "mkv", "avi", "m4v", "wmv", "flv", "mpg", "mpeg"]);

/**
 * Enregistre un fichier envoyé depuis le navigateur (enregistrement ou fichier local).
 * Le flux est écrit directement sur disque (pas de chargement en mémoire), et l'audio des
 * vidéos est extrait avec ffmpeg pour ne garder qu'un fichier léger.
 */
export async function saveUploadedAudio(
  body: ReadableStream<Uint8Array>,
  originalName: string,
  title: string
): Promise<AudioFile> {
  await ensureDir();
  const id = randomUUID();
  const ext = extFromName(originalName) || "webm";
  let fileName = `${id}.${ext}`;
  const uploadPath = path.join(AUDIO_DIR, fileName);
  try {
    await pipeline(Readable.fromWeb(body as NodeReadableStream), createWriteStream(uploadPath));
    if (VIDEO_EXTENSIONS.has(ext)) {
      fileName = `${id}.m4a`;
      await extractAudio(uploadPath, path.join(AUDIO_DIR, fileName));
      await fs.rm(uploadPath, { force: true });
    }
  } catch (err) {
    await fs.rm(uploadPath, { force: true });
    await fs.rm(path.join(AUDIO_DIR, `${id}.m4a`), { force: true });
    throw err;
  }
  const { size } = await fs.stat(path.join(AUDIO_DIR, fileName));
  if (size === 0) {
    await fs.rm(path.join(AUDIO_DIR, fileName), { force: true });
    throw new Error("Le fichier reçu est vide.");
  }
  const file: AudioFile = {
    id,
    title: title || "Fichier importé",
    source: "upload",
    sourceUrl: null,
    platform: null,
    durationSec: null,
    fileName,
    sizeBytes: size,
    createdAt: new Date().toISOString(),
  };
  await writeMeta(file);
  return file;
}

function extractAudio(input: string, output: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      ["-y", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "96k", output],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr = (stderr + c.toString()).slice(-1000)));
    child.on("error", (err: NodeJS.ErrnoException) =>
      reject(
        new Error(
          err.code === "ENOENT" ? "ffmpeg n'est pas installé sur le serveur." : err.message
        )
      )
    );
    child.on("close", (code) => {
      if (code === 0) return resolve();
      console.error("ffmpeg :", stderr);
      reject(
        new Error(
          "impossible d'extraire l'audio de la vidéo (fichier illisible ou format non pris en charge)."
        )
      );
    });
  });
}

function extFromName(name: string | undefined) {
  const match = name?.match(/\.([a-z0-9]{1,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

// --- Téléchargements via yt-dlp -------------------------------------------------------

// Les jobs vivent en mémoire du process Node (un seul process PM2) ; on les accroche à
// globalThis pour qu'ils survivent au rechargement à chaud en développement.
const globalJobs = globalThis as unknown as { __crmasterJobs?: Map<string, AudioDownloadJob> };
const jobs = (globalJobs.__crmasterJobs ??= new Map<string, AudioDownloadJob>());

export function listJobs(): AudioDownloadJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function dismissJob(id: string) {
  const job = jobs.get(id);
  if (job && job.status !== "running") jobs.delete(id);
}

const PRINT_SEPARATOR = "\u001f";

export async function startDownload(url: string): Promise<AudioDownloadJob> {
  await ensureDir();
  const id = randomUUID();
  const job: AudioDownloadJob = {
    id,
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
    path.join(AUDIO_DIR, `${id}.%(ext)s`),
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

  let child;
  try {
    child = spawn(YTDLP_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    job.status = "error";
    job.error = `Impossible de lancer yt-dlp : ${(err as Error).message}`;
    return job;
  }

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
      const stat = await fs.stat(path.join(AUDIO_DIR, fileName));
      const durationNum = Number(duration);
      const file: AudioFile = {
        id,
        title: title && title !== "NA" ? title : url,
        source: "download",
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
