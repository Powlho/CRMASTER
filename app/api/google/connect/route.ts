import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl, authorizationUrl, googleConfigured } from "@/lib/data/google";

export const dynamic = "force-dynamic";

// Envoie vers l'écran d'autorisation Google (lien ouvert depuis la page Agenda).
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!googleConfigured()) {
    return NextResponse.redirect(`${appBaseUrl(req)}/agenda?erreur=${encodeURIComponent("Google Agenda n'est pas configuré sur le serveur.")}`);
  }
  return NextResponse.redirect(await authorizationUrl(req, userId));
}
