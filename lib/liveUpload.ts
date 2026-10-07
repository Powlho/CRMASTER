"use client";

import type { Meeting } from "./types";
import { backupChunk, backupStart, deleteBackup, type Backup } from "./recordingBackup";

// Envoi de l'enregistrement au serveur pendant qu'il se fait (voir
// app/api/meetings/[id]/audio/live/route.ts). Chaque morceau produit par le MediaRecorder
// est gardé en mémoire et copié sur l'appareil, puis envoyé par paquets toutes les
// quelques secondes. Réseau coupé : on réessaie en boucle, le retard se rattrape au retour.

const SEND_INTERVAL_MS = 5000;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const FINISH_ATTEMPTS = 8;

export type LiveUploadPhase = "recording" | "finishing" | "done" | "error";

export interface LiveUploadState {
  phase: LiveUploadPhase;
  totalBytes: number;
  sentBytes: number;
  online: boolean;
  error: string | null;
}

function randomSession(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Session expirée : le middleware redirige vers la page de connexion (réponse HTML).
function failureMessage(res: Response, data: { error?: string }): string {
  if (res.redirected || res.status === 401) {
    return "Session expirée : reconnectez-vous (dans un autre onglet pour ne pas quitter cette page), puis réessayez.";
  }
  return data.error ?? `Erreur serveur (${res.status}).`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Envois en cours, par réunion : quitter la page puis y revenir retrouve l'envoi au lieu
// de le croire interrompu.
const active = new Map<string, LiveUpload>();

export function getActiveUpload(meetingId: string): LiveUpload | undefined {
  return active.get(meetingId);
}

export class LiveUpload {
  readonly meetingId: string;
  readonly session: string;
  readonly mimeType: string;
  private chunks: Blob[] = [];
  private state: LiveUploadState;
  private listeners = new Set<(s: LiveUploadState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<boolean> | null = null;
  private finishing: Promise<Meeting> | null = null;
  private durationSec = 0;
  private backup: boolean;
  // Reprise où le serveur a déjà tout (ou plus) que la copie locale : on finalise ce qu'il a.
  private serverHasAll = false;

  private constructor(opts: {
    meetingId: string;
    session: string;
    mimeType: string;
    chunks?: Blob[];
    sentBytes?: number;
    backup: boolean;
  }) {
    this.meetingId = opts.meetingId;
    this.session = opts.session;
    this.mimeType = opts.mimeType;
    this.chunks = opts.chunks ?? [];
    this.backup = opts.backup;
    const total = this.chunks.reduce((sum, c) => sum + c.size, 0);
    this.state = {
      phase: "recording",
      totalBytes: total,
      sentBytes: Math.min(opts.sentBytes ?? 0, total),
      online: true,
      error: null,
    };
    active.set(this.meetingId, this);
  }

  /** Nouvel enregistrement : copie locale + envoi régulier. */
  static start(meetingId: string, mimeType: string): LiveUpload {
    const upload = new LiveUpload({ meetingId, session: randomSession(), mimeType, backup: true });
    backupStart({
      session: upload.session,
      meetingId,
      mimeType,
      startedAt: new Date().toISOString(),
    });
    upload.timer = setInterval(() => upload.send(), SEND_INTERVAL_MS);
    return upload;
  }

  /** Reprise d'un enregistrement interrompu resté sur l'appareil. */
  static async resume(backup: Backup): Promise<LiveUpload> {
    // Ce que le serveur a déjà reçu n'est pas renvoyé.
    let serverBytes = 0;
    try {
      const res = await fetch(`/api/meetings/${backup.meetingId}/audio/live`);
      const data = (await res.json()) as { parts?: { session: string; size: number }[] };
      serverBytes = data.parts?.find((p) => p.session === backup.session)?.size ?? 0;
    } catch {
      // on renverra tout
    }
    const upload = new LiveUpload({
      meetingId: backup.meetingId,
      session: backup.session,
      mimeType: backup.mimeType,
      chunks: backup.chunks,
      sentBytes: serverBytes,
      backup: false,
    });
    upload.durationSec = backup.durationSec;
    upload.serverHasAll = serverBytes >= backup.sizeBytes;
    return upload;
  }

  get snapshot(): LiveUploadState {
    return this.state;
  }

  get blob(): Blob {
    return new Blob(this.chunks, { type: this.mimeType });
  }

  subscribe(listener: (s: LiveUploadState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<LiveUploadState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  push(chunk: Blob, durationSec: number) {
    const index = this.chunks.length;
    this.chunks.push(chunk);
    this.durationSec = durationSec;
    this.update({ totalBytes: this.state.totalBytes + chunk.size });
    if (this.backup) backupChunk(this.session, index, chunk, durationSec);
  }

  /** Envoie ce qui n'a pas encore été reçu par le serveur. Renvoie true si tout est à jour. */
  private send(): Promise<boolean> {
    if (!this.inflight) {
      this.inflight = this.sendPending().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async sendPending(): Promise<boolean> {
    const base = `/api/meetings/${this.meetingId}/audio/live?session=${this.session}`;
    while (this.state.sentBytes < this.state.totalBytes) {
      const offset = this.state.sentBytes;
      const end = Math.min(this.state.totalBytes, offset + MAX_REQUEST_BYTES);
      try {
        const res = await fetch(`${base}&offset=${offset}`, {
          method: "PUT",
          headers: { "content-type": this.mimeType },
          body: this.blob.slice(offset, end),
        });
        const data = (await res.json().catch(() => ({}))) as { size?: number; error?: string };
        if ((res.ok || res.status === 409) && typeof data.size === "number") {
          // Le serveur dit où il en est (409 = il manque un morceau avant) : on reprend de là.
          this.update({ sentBytes: Math.min(data.size, this.state.totalBytes), online: true });
          continue;
        }
        this.update({ online: false, error: failureMessage(res, data) });
        return false;
      } catch {
        this.update({ online: false, error: "Connexion au serveur perdue." });
        return false;
      }
    }
    this.update({ online: true, error: null });
    return true;
  }

  /**
   * Fin d'enregistrement : envoie le reste puis fait de ce fichier l'audio de la réunion.
   * Rappelable après un échec (bouton « Réessayer »).
   */
  finish(durationSec?: number): Promise<Meeting> {
    if (durationSec !== undefined) this.durationSec = durationSec;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.finishing) {
      this.finishing = this.doFinish().finally(() => {
        this.finishing = null;
      });
    }
    return this.finishing;
  }

  private async doFinish(): Promise<Meeting> {
    this.update({ phase: "finishing", error: null });
    for (let attempt = 0; attempt < FINISH_ATTEMPTS; attempt++) {
      if (attempt > 0) await sleep(Math.min(15000, 1000 * 2 ** attempt));
      if (!(await this.send())) continue;
      try {
        const res = await fetch(
          `/api/meetings/${this.meetingId}/audio/live?session=${this.session}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              durationSec: this.durationSec,
              expectedBytes: this.serverHasAll ? undefined : this.state.totalBytes,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as Partial<Meeting> & {
          error?: string;
          size?: number;
        };
        if (res.ok && data.audio) {
          await deleteBackup(this.session);
          this.update({ phase: "done", online: true });
          active.delete(this.meetingId);
          return data as Meeting;
        }
        if (res.status === 409 && typeof data.size === "number") {
          this.update({ sentBytes: Math.min(data.size, this.state.totalBytes) });
          continue;
        }
        this.update({ online: res.status < 500, error: failureMessage(res, data) });
        if (res.redirected || res.status === 401 || res.status === 404) break;
      } catch {
        this.update({ online: false, error: "Connexion au serveur perdue." });
      }
    }
    const message =
      this.state.error ?? "L'enregistrement n'a pas pu être envoyé au serveur.";
    this.update({ phase: "error", error: message });
    throw new Error(message);
  }

  /** Abandon (copie locale supprimée par l'appelant s'il le souhaite). */
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (active.get(this.meetingId) === this) active.delete(this.meetingId);
  }
}
