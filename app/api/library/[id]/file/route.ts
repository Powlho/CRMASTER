import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { getLibraryFile, libraryFilePath, libraryMimeType } from "@/lib/data/library";

export const dynamic = "force-dynamic";

// Sert le fichier audio (lecture dans le navigateur, avec prise en charge des Range requests
// pour pouvoir avancer dans la piste, et téléchargement avec ?download=1).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const file = await getLibraryFile(params.id, userId);
  if (!file) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });

  const filePath = libraryFilePath(file);
  let size: number;
  try {
    size = (await fs.stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Fichier audio introuvable." }, { status: 404 });
  }
  const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const headers = new Headers({
    "Content-Type": libraryMimeType(file) ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.nextUrl.searchParams.get("download") === "1") {
    const safeTitle = file.title.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 120);
    headers.set(
      "Content-Disposition",
      `attachment; filename="audio.${ext}"; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.${ext}`)}`
    );
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (match[1] === "" && match[2] === "")) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    if (match[1] === "") {
      start = Math.max(0, size - Number(match[2]));
    } else {
      start = Number(match[1]);
      if (match[2] !== "") end = Math.min(Number(match[2]), size - 1);
    }
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));

  const stream = Readable.toWeb(createReadStream(filePath, { start, end }));
  return new Response(stream as unknown as ReadableStream, { status, headers });
}
