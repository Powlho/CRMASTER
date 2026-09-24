import { NextRequest, NextResponse } from "next/server";
import { getMeetingById, patchMeeting, removeMeeting } from "@/lib/data/store";
import type { Meeting } from "@/lib/types";

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
  const meeting = await patchMeeting(params.id, userId, patch);
  if (!meeting) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = requireUserId(req);
  if (typeof userId !== "string") return userId;

  await removeMeeting(params.id, userId);
  return NextResponse.json({ ok: true });
}
