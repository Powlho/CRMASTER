import type { AudioFile } from "./types";

/** Lit la réponse JSON d'une route API, avec un message clair quand le serveur n'en renvoie pas. */
export async function readApiResponse<T>(res: Response): Promise<T> {
  let data: (T & { error?: string }) | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok && data) return data;
  if (data?.error) throw new Error(data.error);
  if (res.status === 413) {
    throw new Error(
      "Envoi refusé car trop volumineux (limite Nginx du serveur). Lancez « sudo bash deploy/update.sh » sur le VPS."
    );
  }
  if (res.status === 502 || res.status === 503) {
    throw new Error("Le serveur de l'application ne répond pas (redémarrage en cours ?).");
  }
  if (res.status === 504) {
    throw new Error("Le serveur a mis trop de temps à répondre.");
  }
  throw new Error(`Erreur du serveur (${res.status}).`);
}

// Sous la limite de 100 Mo par requête de Cloudflare, et assez petit pour que chaque morceau
// passe avant son délai d'attente (100 s) même sur une connexion lente.
const CHUNK_SIZE = 20 * 1024 * 1024;

/**
 * Envoie un fichier audio (ou vidéo) dans la bibliothèque du serveur, par morceaux.
 * `onProgress` reçoit l'avancement de 0 à 100.
 */
export async function uploadAudio(
  blob: Blob,
  fileName: string,
  title: string,
  onProgress?: (percent: number) => void
): Promise<AudioFile> {
  if (blob.size === 0) throw new Error("Le fichier est vide.");
  const uploadId = crypto.randomUUID();
  for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
    const chunk = blob.slice(offset, offset + CHUNK_SIZE);
    let res: Response;
    try {
      res = await fetch("/api/audio", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-id": uploadId,
          "x-offset": String(offset),
          "x-total-size": String(blob.size),
          "x-file-name": encodeURIComponent(fileName),
          "x-title": encodeURIComponent(title),
        },
        body: chunk,
      });
    } catch {
      throw new Error("Connexion au serveur interrompue pendant l'envoi du fichier.");
    }
    const data = await readApiResponse<{ done: boolean; file?: AudioFile }>(res);
    onProgress?.(Math.round(((offset + chunk.size) / blob.size) * 100));
    if (data.done && data.file) return data.file;
  }
  throw new Error("Le serveur n'a pas confirmé la réception complète du fichier.");
}
