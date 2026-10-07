import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { audioFilePath, getAudioFile } from "@/lib/server/audioLibrary";

export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  mp3: "audio/mpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
};

// Sert le fichier audio (lecture dans le navigateur, avec prise en charge des Range requests
// pour pouvoir avancer dans la piste, et téléchargement avec ?download=1).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const file = await getAudioFile(params.id);
  if (!file) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });

  const filePath = audioFilePath(file);
  const { size } = await fs.stat(filePath);
  const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "";
  const headers: Record<string, string> = {
    "content-type": MIME_TYPES[ext] ?? "application/octet-stream",
    "accept-ranges": "bytes",
  };
  if (req.nextUrl.searchParams.get("download")) {
    const safeTitle = file.title.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 120);
    headers["content-disposition"] =
      `attachment; filename="${file.fileName}"; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.${ext}`)}`;
  }

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? parseInt(range[1], 10) : size - parseInt(range[2], 10);
    const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
    if (start < 0 || start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${size}`,
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, {
    headers: { ...headers, "content-length": String(size) },
  });
}
