import { NextRequest, NextResponse } from "next/server";
import { listAudioFiles, saveUploadedAudio } from "@/lib/server/audioLibrary";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ files: await listAudioFiles() });
}

// Import d'un fichier audio (enregistrement du navigateur ou fichier local) dans la
// bibliothèque. Le fichier est envoyé brut dans le corps de la requête, le nom et le titre
// dans les en-têtes x-file-name / x-title (encodés en URI).
export async function POST(req: NextRequest) {
  if (!req.body) {
    return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
  }
  const decode = (v: string | null) => {
    try {
      return v ? decodeURIComponent(v) : "";
    } catch {
      return "";
    }
  };
  try {
    const file = await saveUploadedAudio(
      req.body,
      decode(req.headers.get("x-file-name")),
      decode(req.headers.get("x-title")).slice(0, 300)
    );
    return NextResponse.json({ file });
  } catch (err) {
    console.error("Import audio échoué :", err);
    return NextResponse.json(
      { error: `Échec de l'enregistrement du fichier sur le serveur : ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
