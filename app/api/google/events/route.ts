import { NextRequest, NextResponse } from "next/server";
import { GoogleReconnectError, listEvents } from "@/lib/data/google";

export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const from = new Date(req.nextUrl.searchParams.get("from") ?? "");
  const to = new Date(req.nextUrl.searchParams.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: "Période invalide." }, { status: 400 });
  }
  try {
    const events = await listEvents(userId, from.toISOString(), to.toISOString());
    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, reconnect: err instanceof GoogleReconnectError },
      { status: err instanceof GoogleReconnectError ? 401 : 502 }
    );
  }
}
