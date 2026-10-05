import { NextRequest, NextResponse } from "next/server";
import { getMeetingById, patchMeeting, removeMeeting } from "@/lib/data/store";
import { deleteMeetingAudio } from "@/lib/data/audio";
import type { Meeting } from "@/lib/types";

// Champs fixés par le serveur : un client ne doit pas pouvoir changer l'id ou le propriétaire
// d'une réunion, ni déclarer un fichier audio qu'il n'a pas réellement envoyé.
const SERVER_ONLY_FIELDS = ["id", "userId", "createdAt", "audio"] as const;

function requireUserId(req: NextRequest): string | NextResponse {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  return userId;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUserId(req);
  if (typeof userId !== "string") return userId;

  const meeting = await getMeetingById(params.id, userId);
  if (!meeting) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUserId(req);
  if (typeof userId !== "string") return userId;

  const patch = (await req.json()) as Partial<Meeting>;
  for (const field of SERVER_ONLY_FIELDS) delete patch[field];

  const meeting = await patchMeeting(params.id, userId, patch);
  if (!meeting) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUserId(req);
  if (typeof userId !== "string") return userId;

  const meeting = await getMeetingById(params.id, userId);
  if (!meeting) return NextResponse.json({ ok: true });

  await removeMeeting(meeting.id, userId);
  await deleteMeetingAudio(meeting.id);
  return NextResponse.json({ ok: true });
}
