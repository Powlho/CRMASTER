import { NextRequest, NextResponse } from "next/server";
import { deleteCookies, getCookiesStatus, saveCookies } from "@/lib/data/library";
import { requireAdmin } from "@/lib/data/adminGuard";

export const dynamic = "force-dynamic";

// Le contenu des cookies n'est jamais renvoyé au navigateur : seulement leur présence.
export async function GET(req: NextRequest) {
  if (!req.headers.get("x-user-id")) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  return NextResponse.json(await getCookiesStatus());
}

// Les cookies servent à tous les comptes : seul un administrateur peut les changer.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const formData = await req.formData();
  const file = formData.get("cookies");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Fichier cookies manquant." }, { status: 400 });
  }
  if (file.size > 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop volumineux." }, { status: 400 });
  }
  const content = await file.text();
  const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  const isNetscape = lines.length > 0 && lines.every((l) => l.split("\t").length >= 7);
  if (!isNetscape) {
    return NextResponse.json(
      { error: "Format invalide : exportez les cookies au format Netscape (cookies.txt)." },
      { status: 400 }
    );
  }
  if (!lines.some((l) => l.includes("youtube.com"))) {
    return NextResponse.json(
      { error: "Aucun cookie youtube.com dans ce fichier : exportez-le depuis un onglet YouTube." },
      { status: 400 }
    );
  }
  // yt-dlp exige l'en-tête Netscape en première ligne.
  await saveCookies(
    content.startsWith("# Netscape HTTP Cookie File") || content.startsWith("# HTTP Cookie File")
      ? content
      : `# Netscape HTTP Cookie File\n${content}`
  );
  return NextResponse.json(await getCookiesStatus());
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  await deleteCookies();
  return NextResponse.json(await getCookiesStatus());
}
