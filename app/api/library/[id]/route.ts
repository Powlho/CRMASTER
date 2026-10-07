import { NextRequest, NextResponse } from "next/server";
import { deleteLibraryFile, getLibraryFile } from "@/lib/data/library";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const file = await getLibraryFile(params.id, userId);
  if (!file) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return NextResponse.json({ file });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const deleted = await deleteLibraryFile(params.id, userId);
  if (!deleted) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
