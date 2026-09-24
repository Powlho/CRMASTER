import { NextRequest, NextResponse } from "next/server";
import { insertMeeting, listMeetings } from "@/lib/data/store";
import type { NewMeetingInput } from "@/lib/types";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const meetings = await listMeetings(userId);
  return NextResponse.json(meetings);
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const input = (await req.json()) as NewMeetingInput;
  if (!input.title?.trim()) {
    return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  }
  const meeting = await insertMeeting(input, userId);
  return NextResponse.json(meeting, { status: 201 });
}
