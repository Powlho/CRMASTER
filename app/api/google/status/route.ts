import { NextRequest, NextResponse } from "next/server";
import { disconnect, getConnection, googleConfigured, redirectUri } from "@/lib/data/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const connection = await getConnection(userId);
  return NextResponse.json({
    configured: googleConfigured(),
    connected: Boolean(connection),
    email: connection?.email ?? null,
    // À déclarer tel quel dans la console Google Cloud (URI de redirection autorisée).
    redirectUri: redirectUri(req),
  });
}

// Déconnexion : le jeton est révoqué chez Google puis oublié.
export async function DELETE(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  await disconnect(userId);
  return NextResponse.json({ ok: true });
}
