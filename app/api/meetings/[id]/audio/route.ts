import { NextRequest, NextResponse } from "next/server";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { getMeetingById, patchMeeting } from "@/lib/data/store";
import {
  AUDIO_EXTENSIONS,
  audioPath,
  ensureAudioDir,
  newAudioPatch,
  normalizeAudioType,
  parseDuration,
} from "@/lib/data/audio";
import { fileBaseName } from "@/lib/meetingText";

export const dynamic = "force-dynamic";

async function findOwnedMeeting(req: NextRequest, id: string) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  const meeting = await getMeetingById(id, userId);
  if (!meeting) {
    return { error: NextResponse.json({ error: "Introuvable." }, { status: 404 }) };
  }
  return { meeting, userId };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const found = await findOwnedMeeting(req, params.id);
  if (found.error) return found.error;
  const { meeting, userId } = found;

  const type = normalizeAudioType(req.headers.get("content-type"));
  if (!type) {
    return NextResponse.json({ error: "Format audio non pris en charge." }, { status: 415 });
  }
  if (!req.body) {
    return NextResponse.json({ error: "Enregistrement manquant." }, { status: 400 });
  }

  await ensureAudioDir();
  const finalPath = audioPath(meeting.id);
  const tmpPath = `${finalPath}.upload`;

  // Écriture en flux vers un fichier temporaire, renommé seulement une fois complet :
  // un envoi interrompu ne remplace jamais un enregistrement déjà sauvegardé.
  try {
    await pipeline(
      Readable.fromWeb(req.body as unknown as NodeReadableStream),
      createWriteStream(tmpPath)
    );
  } catch {
    await fs.unlink(tmpPath).catch(() => {});
    return NextResponse.json({ error: "Envoi interrompu, réessayez." }, { status: 400 });
  }

  const { size } = await fs.stat(tmpPath);
  if (size === 0) {
    await fs.unlink(tmpPath).catch(() => {});
    return NextResponse.json({ error: "Enregistrement vide." }, { status: 400 });
  }
  await fs.rename(tmpPath, finalPath);

  const updated = await patchMeeting(
    meeting.id,
    userId,
    newAudioPatch(
      { mimeType: type, sizeBytes: size, savedAt: new Date().toISOString() },
      parseDuration(req.nextUrl.searchParams.get("durationSec"))
    )
  );
  return NextResponse.json(updated);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const found = await findOwnedMeeting(req, params.id);
  if (found.error) return found.error;
  const { meeting } = found;
  if (!meeting.audio) {
    return NextResponse.json({ error: "Aucun enregistrement." }, { status: 404 });
  }

  const filePath = audioPath(meeting.id);
  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Fichier audio introuvable." }, { status: 404 });
  }

  const ext = AUDIO_EXTENSIONS[meeting.audio.mimeType];
  const headers = new Headers({
    "Content-Type": ext ? meeting.audio.mimeType : "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.nextUrl.searchParams.get("download") === "1") {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${fileBaseName(meeting)}.${ext ?? "bin"}"`
    );
  }

  // Lecture partielle (Range) : nécessaire pour avancer dans un long enregistrement.
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match && !(match[1] === "" && match[2] === "")) {
      if (match[1] === "") {
        start = Math.max(0, size - Number(match[2]));
      } else {
        start = Number(match[1]);
        if (match[2] !== "") end = Math.min(Number(match[2]), size - 1);
      }
    }
    if (!match || (match[1] === "" && match[2] === "") || start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));

  const stream = Readable.toWeb(createReadStream(filePath, { start, end }));
  return new Response(stream as unknown as ReadableStream, { status, headers });
}
