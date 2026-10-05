"use client";

import type { Meeting } from "./types";

// Limite fixée par Nginx sur le serveur (client_max_body_size).
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

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

// XMLHttpRequest plutôt que fetch : seul lui donne la progression de l'envoi, utile pour
// un gros fichier envoyé en 4G.
export function uploadFile(
  meetingId: string,
  file: Blob,
  type: string,
  durationSec: number | null,
  onProgress: (ratio: number) => void
): Promise<Meeting> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const query = durationSec !== null ? `?durationSec=${durationSec}` : "";
    xhr.open("POST", `/api/meetings/${meetingId}/audio${query}`);
    xhr.setRequestHeader("content-type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { error?: string } & Partial<Meeting> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // réponse non JSON (session expirée → page de connexion, erreur Nginx…)
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.audio) {
        resolve(data as Meeting);
      } else if (xhr.status === 413) {
        reject(new Error("Fichier trop volumineux pour le serveur (500 Mo maximum)."));
      } else {
        reject(
          new Error(data.error || "Le serveur n'a pas accepté le fichier. Reconnectez-vous puis réessayez.")
        );
      }
    };
    xhr.onerror = () => reject(new Error("Connexion perdue pendant l'envoi."));
    xhr.send(file);
  });
}
