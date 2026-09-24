import { NextRequest, NextResponse } from "next/server";
import { getMeetingById, patchMeeting, removeMeeting } from "@/lib/data/store";
import type { Meeting } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meeting = await getMeetingById(params.id);
  if (!meeting) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const patch = (await req.json()) as Partial<Meeting>;
  const meeting = await patchMeeting(params.id, patch);
  if (!meeting) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  return NextResponse.json(meeting);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await removeMeeting(params.id);
  return NextResponse.json({ ok: true });
}
