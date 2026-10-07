import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/data/adminGuard";
import { RETENTION_CHOICES, getSettings, saveSettings } from "@/lib/data/settings";
import { audioUsage, runMaintenance } from "@/lib/data/maintenance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  return NextResponse.json({ settings: await getSettings(), usage: await audioUsage() });
}

export async function PUT(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as { audioRetentionDays?: unknown };
  if (
    typeof body.audioRetentionDays !== "number" ||
    !RETENTION_CHOICES.includes(body.audioRetentionDays)
  ) {
    return NextResponse.json({ error: "Durée de conservation invalide." }, { status: 400 });
  }
  const settings = await saveSettings({ audioRetentionDays: body.audioRetentionDays });
  // Appliquée tout de suite plutôt qu'au prochain passage automatique (toutes les 6 h).
  const report = await runMaintenance();
  return NextResponse.json({ settings, report, usage: await audioUsage() });
}
