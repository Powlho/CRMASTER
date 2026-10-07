import { NextRequest, NextResponse } from "next/server";
import { deleteAudioFile, getAudioFile } from "@/lib/server/audioLibrary";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const file = await getAudioFile(params.id);
  if (!file) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return NextResponse.json({ file });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const deleted = await deleteAudioFile(params.id);
  if (!deleted) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
