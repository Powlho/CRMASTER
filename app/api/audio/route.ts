import { NextRequest, NextResponse } from "next/server";
import { listAudioFiles, saveUploadChunk, UploadError } from "@/lib/server/audioLibrary";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ files: await listAudioFiles() });
}

// Import d'un fichier audio (enregistrement du navigateur ou fichier local) dans la
// bibliothèque, par morceaux : chaque requête porte un morceau brut dans son corps, et les
// en-têtes x-upload-id / x-offset / x-total-size / x-file-name / x-title (encodés en URI).
export async function POST(req: NextRequest) {
  if (!req.body) {
    return NextResponse.json({ error: "Fichier audio manquant." }, { status: 400 });
  }
  const header = (name: string) => {
    try {
      return decodeURIComponent(req.headers.get(name) ?? "");
    } catch {
      return "";
    }
  };
  try {
    const result = await saveUploadChunk({
      uploadId: header("x-upload-id"),
      offset: Number(header("x-offset")),
      total: Number(header("x-total-size")),
      body: req.body,
      originalName: header("x-file-name"),
      title: header("x-title").slice(0, 300),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Import audio échoué :", err);
    return NextResponse.json(
      { error: `Échec de l'enregistrement du fichier sur le serveur : ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
