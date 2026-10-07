import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl, handleCallback } from "@/lib/data/google";

export const dynamic = "force-dynamic";

// Retour de Google après autorisation : on échange le code contre les jetons, puis retour
// à la page Agenda.
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  const back = (error?: string) =>
    NextResponse.redirect(
      `${appBaseUrl(req)}/agenda${error ? `?erreur=${encodeURIComponent(error)}` : ""}`
    );
  if (!userId) return back("Session expirée : reconnectez-vous à CRMASTER puis recommencez.");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return back(params.get("error") === "access_denied" ? "Autorisation refusée." : `Google : ${params.get("error")}`);
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("Réponse de Google incomplète.");
  try {
    await handleCallback(req, userId, code, state);
    return back();
  } catch (err) {
    return back((err as Error).message);
  }
}
