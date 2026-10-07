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
      "Fichier trop volumineux pour le serveur (limite Nginx). Lancez « sudo bash deploy/update.sh » sur le VPS pour relever la limite."
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

/** Envoie un fichier audio (ou vidéo) dans la bibliothèque du serveur, en flux brut. */
export async function uploadAudio(blob: Blob, fileName: string, title: string) {
  let res: Response;
  try {
    res = await fetch("/api/audio", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": encodeURIComponent(fileName),
        "x-title": encodeURIComponent(title),
      },
      body: blob,
    });
  } catch {
    throw new Error("Connexion au serveur interrompue pendant l'envoi du fichier.");
  }
  const data = await readApiResponse<{ file: AudioFile }>(res);
  return data.file;
}
