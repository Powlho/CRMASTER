import { NextRequest, NextResponse } from "next/server";
import { insertMeeting, listMeetings } from "@/lib/data/store";
import type { NewMeetingInput } from "@/lib/types";

export async function GET() {
  const meetings = await listMeetings();
  return NextResponse.json(meetings);
}

export async function POST(req: NextRequest) {
  const input = (await req.json()) as NewMeetingInput;
  if (!input.title?.trim()) {
    return NextResponse.json({ error: "Titre requis." }, { status: 400 });
  }
  const meeting = await insertMeeting(input);
  return NextResponse.json(meeting, { status: 201 });
}
