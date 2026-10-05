import { NextRequest, NextResponse } from "next/server";

// Le partage Android est normalement intercepté par le service worker (public/sw.js), qui
// garde le fichier. On n'arrive ici que si ce dernier n'est pas encore actif : on renvoie
// vers la page de partage, qui explique de réessayer.
export function POST(req: NextRequest) {
  return NextResponse.redirect(new URL("/partager?erreur=sw", req.url), 303);
}
