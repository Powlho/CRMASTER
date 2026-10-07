import { NextRequest, NextResponse } from "next/server";
import { listAudioFiles, saveUploadedAudio } from "@/lib/server/audioLibrary";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ files: await listAudioFiles() });
}

// Import d'un fichier audio (enregistrement du navigateur ou fichier local) dans la bibliothèque.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
  }
  const title = String(formData.get("title") || "").slice(0, 300);
  const file = await saveUploadedAudio(audio, title);
  return NextResponse.json({ file });
}
