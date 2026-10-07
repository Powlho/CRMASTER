import { NextRequest, NextResponse } from "next/server";
import { listLibrary } from "@/lib/data/library";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  return NextResponse.json({ files: await listLibrary(userId) });
}
