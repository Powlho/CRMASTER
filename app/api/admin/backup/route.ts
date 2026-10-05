import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/adminGuard";
import { listAllMeetings } from "@/lib/data/store";
import { getSettings } from "@/lib/data/settings";

export const dynamic = "force-dynamic";

// Copie de toutes les réunions (transcriptions, comptes rendus) à garder hors du serveur.
// Les comptes (mots de passe chiffrés) et les fichiers audio n'y figurent pas.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const now = new Date();
  const payload = {
    app: "crmaster",
    exportedAt: now.toISOString(),
    settings: await getSettings(),
    meetings: await listAllMeetings(),
  };
  const stamp = now.toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="crmaster-sauvegarde-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
