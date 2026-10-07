"use client";

import type { Meeting } from "./types";

// Les fichiers partent par morceaux : chaque requête reste sous la limite de Cloudflare
// (100 Mo) et sous son délai d'attente (100 s), même en 4G.
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_IMPORT_LABEL = "2 Go";
const CHUNK_BYTES = 16 * 1024 * 1024;

// Durée d'un fichier importé, lue par le navigateur (null si illisible ici : la
// transcription fonctionnera quand même).
export function probeDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("audio");
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 8000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      clearTimeout(timeout);
      finish(Number.isFinite(el.duration) ? Math.round(el.duration) : null);
    };
    el.onerror = () => {
      clearTimeout(timeout);
      finish(null);
    };
    el.src = url;
  });
}

function parseJson(text: string): ({ error?: string; size?: number } & Partial<Meeting>) | null {
  try {
    return JSON.parse(text);
  } catch {
    // réponse non JSON (session expirée → page de connexion, erreur Nginx/Cloudflare…)
    return null;
  }
}

function errorFor(status: number, data: { error?: string } | null): Error {
  if (data?.error) return new Error(data.error);
  if (status === 413) return new Error("Envoi refusé par le serveur : morceau trop volumineux.");
  if (status === 401 || status === 0) {
    return new Error("Le serveur n'a pas accepté le fichier. Reconnectez-vous puis réessayez.");
  }
  return new Error(`Le serveur n'a pas accepté le fichier (erreur ${status}).`);
}

// XMLHttpRequest plutôt que fetch : seul lui donne la progression de l'envoi, utile pour
// un gros fichier envoyé en 4G.
function putChunk(
  url: string,
  chunk: Blob,
  type: string,
  onProgress: (loaded: number) => void
): Promise<{ status: number; data: ReturnType<typeof parseJson> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, data: parseJson(xhr.responseText) });
    xhr.onerror = () => reject(new Error("Connexion perdue pendant l'envoi."));
    xhr.send(chunk);
  });
}

/**
 * Envoie un fichier comme audio de la réunion, par morceaux, via le même point d'entrée que
 * l'envoi au fil de l'eau des enregistrements (reprise à la position confirmée par le serveur).
 */
export async function uploadFile(
  meetingId: string,
  file: Blob,
  type: string,
  durationSec: number | null,
  onProgress: (ratio: number) => void
): Promise<Meeting> {
  const session = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  const base = `/api/meetings/${meetingId}/audio/live?session=${session}`;

  let offset = 0;
  let failures = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_BYTES);
    let result: Awaited<ReturnType<typeof putChunk>>;
    try {
      result = await putChunk(`${base}&offset=${offset}`, chunk, type, (loaded) =>
        onProgress((offset + loaded) / file.size)
      );
    } catch (err) {
      if (++failures > 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * failures));
      continue;
    }
    // 409 : le serveur n'a pas tout reçu, on reprend à la position qu'il indique.
    if ((result.status === 200 || result.status === 409) && typeof result.data?.size === "number") {
      if (result.data.size > offset) failures = 0;
      else if (++failures > 3) {
        throw new Error("L'envoi n'avance plus. Vérifiez votre connexion puis réessayez.");
      }
      offset = result.data.size;
      continue;
    }
    throw errorFor(result.status, result.data);
  }

  const res = await fetch(base, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ durationSec, expectedBytes: file.size }),
  });
  const data = parseJson(await res.text());
  if (!res.ok || !data?.audio) throw errorFor(res.status, data);
  onProgress(1);
  return data as Meeting;
}
