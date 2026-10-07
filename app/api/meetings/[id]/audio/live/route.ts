import { NextRequest, NextResponse } from "next/server";
import { createWriteStream, promises as fs } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { getMeetingById, patchMeeting } from "@/lib/data/store";
import {
  audioPath,
  deleteLivePart,
  ensureAudioDir,
  isValidSession,
  listLiveParts,
  livePartPath,
  livePartTypePath,
  newAudioPatch,
  normalizeAudioType,
  parseDuration,
} from "@/lib/data/audio";

export const dynamic = "force-dynamic";

// Envoi « au fil de l'eau » : pendant l'enregistrement, le navigateur envoie régulièrement
// les nouveaux morceaux, ajoutés à la suite dans un fichier .part. À l'arrêt, ce fichier
// devient l'audio de la réunion. Si le téléphone s'éteint en cours de route, ce qui a déjà
// été reçu reste récupérable.
//
//   PUT  ?session=S&offset=N  corps = octets à partir de la position N
//   POST ?session=S           finalise (JSON { durationSec?, expectedBytes? })
//   GET                       enregistrements interrompus en attente sur le serveur

// Un seul traitement à la fois par fichier : une requête qui a expiré côté navigateur peut
// encore être en cours d'écriture quand son nouvel essai arrive.
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const settled = run.catch(() => undefined);
  locks.set(key, settled);
  settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
}

async function findOwnedMeeting(req: NextRequest, id: string) {
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };
  }
  const meeting = await getMeetingById(id, userId);
  if (!meeting) {
    return { error: NextResponse.json({ error: "Introuvable." }, { status: 404 }) };
  }
  return { meeting, userId };
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const found = await findOwnedMeeting(req, params.id);
  if (found.error) return found.error;
  return NextResponse.json({ parts: await listLiveParts(found.meeting.id) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const found = await findOwnedMeeting(req, params.id);
  if (found.error) return found.error;
  const { meeting } = found;

  const session = req.nextUrl.searchParams.get("session");
  const offset = Number(req.nextUrl.searchParams.get("offset"));
  if (!isValidSession(session) || !Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }
  const type = normalizeAudioType(req.headers.get("content-type"));
  if (!type) {
    return NextResponse.json({ error: "Format audio non pris en charge." }, { status: 415 });
  }
  if (!req.body) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }
  const body = req.body;

  await ensureAudioDir();
  const partPath = livePartPath(meeting.id, session);

  return withLock(partPath, async () => {
    const size = await fileSize(partPath);
    // Trou dans la séquence (un envoi précédent a été perdu) : le navigateur reprend à
    // partir de ce que le serveur a réellement.
    if (offset > size) {
      await body.cancel().catch(() => {});
      return NextResponse.json({ size }, { status: 409 });
    }
    // Renvoi de données déjà reçues (réponse perdue en route) : on les réécrit.
    if (offset < size) await fs.truncate(partPath, offset);
    if (offset === 0) await fs.writeFile(livePartTypePath(meeting.id, session), type, "utf-8");

    try {
      await pipeline(
        Readable.fromWeb(body as unknown as NodeReadableStream),
        createWriteStream(partPath, { flags: "a" })
      );
    } catch {
      // Connexion coupée en plein envoi : ce qui a été écrit reste, le navigateur
      // reprendra à partir de la taille renvoyée au prochain essai.
    }
    return NextResponse.json({ size: await fileSize(partPath) });
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const found = await findOwnedMeeting(req, params.id);
  if (found.error) return found.error;
  const { meeting, userId } = found;

  const session = req.nextUrl.searchParams.get("session");
  if (!isValidSession(session)) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    durationSec?: number;
    expectedBytes?: number;
  };

  const partPath = livePartPath(meeting.id, session);
  return withLock(partPath, async () => {
    const size = await fileSize(partPath);
    if (size === 0) {
      return NextResponse.json(
        { error: "Le serveur n'a rien reçu pour cet enregistrement." },
        { status: 404 }
      );
    }
    // Le navigateur annonce la taille totale : s'il manque la fin, il doit d'abord la renvoyer.
    if (typeof body.expectedBytes === "number" && body.expectedBytes !== size) {
      return NextResponse.json({ size }, { status: 409 });
    }

    const type =
      normalizeAudioType(
        await fs.readFile(livePartTypePath(meeting.id, session), "utf-8").catch(() => null)
      ) ?? "audio/webm";

    await fs.rename(partPath, audioPath(meeting.id));
    await deleteLivePart(meeting.id, session);
    // Les autres enregistrements interrompus de cette réunion sont remplacés par celui-ci.
    for (const other of await listLiveParts(meeting.id)) {
      await deleteLivePart(meeting.id, other.session);
    }

    const updated = await patchMeeting(
      meeting.id,
      userId,
      newAudioPatch(
        { mimeType: type, sizeBytes: size, savedAt: new Date().toISOString() },
        parseDuration(body.durationSec)
      )
    );
    return NextResponse.json(updated);
  });
}
