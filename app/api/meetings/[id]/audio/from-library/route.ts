import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getMeetingById, patchMeeting } from "@/lib/data/store";
import { audioPath, ensureAudioDir, newAudioPatch } from "@/lib/data/audio";
import { getLibraryFile, libraryFilePath, libraryMimeType } from "@/lib/data/library";

export const dynamic = "force-dynamic";

// Utilise un fichier de la bibliothèque audio comme audio de la réunion (copie : le fichier
// reste dans la bibliothèque, la durée de conservation des audios de réunion s'applique à
// la copie).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const meeting = await getMeetingById(params.id, userId);
  if (!meeting) return NextResponse.json({ error: "Réunion introuvable." }, { status: 404 });

  const { libraryId } = (await req.json().catch(() => ({}))) as { libraryId?: string };
  const file = libraryId ? await getLibraryFile(libraryId, userId) : null;
  if (!file) {
    return NextResponse.json({ error: "Fichier introuvable dans la bibliothèque." }, { status: 404 });
  }
  const mimeType = libraryMimeType(file);
  if (!mimeType) {
    return NextResponse.json({ error: "Format audio non pris en charge." }, { status: 415 });
  }

  await ensureAudioDir();
  const finalPath = audioPath(meeting.id);
  const tmpPath = `${finalPath}.upload`;
  try {
    await fs.copyFile(libraryFilePath(file), tmpPath);
    await fs.rename(tmpPath, finalPath);
  } catch {
    await fs.unlink(tmpPath).catch(() => {});
    return NextResponse.json({ error: "Copie du fichier impossible." }, { status: 500 });
  }

  const updated = await patchMeeting(
    meeting.id,
    userId,
    newAudioPatch(
      { mimeType, sizeBytes: file.sizeBytes, savedAt: new Date().toISOString() },
      file.durationSec
    )
  );
  return NextResponse.json(updated);
}
