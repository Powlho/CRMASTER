"use client";

// Copie de secours des enregistrements sur l'appareil (IndexedDB) : chaque morceau y est
// écrit au fil de l'enregistrement et n'est effacé qu'une fois l'audio sauvegardé sur le
// serveur. Batterie vide, onglet fermé ou réseau coupé : rien n'est perdu.
// Toutes les fonctions échouent en silence si le stockage est indisponible (navigation
// privée…) : l'enregistrement fonctionne alors sans copie locale.

const DB_NAME = "crmaster-recordings";
const SESSIONS = "sessions";
const CHUNKS = "chunks";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface BackupSession {
  session: string;
  meetingId: string;
  mimeType: string;
  startedAt: string;
  updatedAt: string;
  durationSec: number;
}

export interface Backup extends BackupSession {
  chunks: Blob[];
  sizeBytes: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(SESSIONS, { keyPath: "session" }).createIndex("meetingId", "meetingId");
        db.createObjectStore(CHUNKS, { keyPath: ["session", "index"] });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function backupStart(meta: Omit<BackupSession, "updatedAt" | "durationSec">) {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSIONS, "readwrite");
    tx.objectStore(SESSIONS).put({ ...meta, updatedAt: meta.startedAt, durationSec: 0 });
    await done(tx);
  } catch {
    // pas de copie locale possible
  }
}

export async function backupChunk(
  session: string,
  index: number,
  blob: Blob,
  durationSec: number
) {
  try {
    const db = await openDb();
    const tx = db.transaction([SESSIONS, CHUNKS], "readwrite");
    tx.objectStore(CHUNKS).put({ session, index, blob });
    const sessions = tx.objectStore(SESSIONS);
    const meta = (await result(sessions.get(session))) as BackupSession | undefined;
    if (meta) {
      sessions.put({ ...meta, durationSec, updatedAt: new Date().toISOString() });
    }
    await done(tx);
  } catch {
    // stockage plein ou indisponible : l'envoi au serveur continue
  }
}

export async function deleteBackup(session: string) {
  try {
    const db = await openDb();
    const tx = db.transaction([SESSIONS, CHUNKS], "readwrite");
    tx.objectStore(SESSIONS).delete(session);
    tx.objectStore(CHUNKS).delete(IDBKeyRange.bound([session, 0], [session, Infinity]));
    await done(tx);
  } catch {
    // rien à faire
  }
}

/** Enregistrements de cette réunion restés sur l'appareil, du plus récent au plus ancien. */
export async function findBackups(meetingId: string): Promise<Backup[]> {
  try {
    const db = await openDb();
    const tx = db.transaction([SESSIONS, CHUNKS], "readonly");
    const sessions = (await result(
      tx.objectStore(SESSIONS).index("meetingId").getAll(meetingId)
    )) as BackupSession[];

    const backups: Backup[] = [];
    for (const meta of sessions) {
      const rows = (await result(
        tx
          .objectStore(CHUNKS)
          .getAll(IDBKeyRange.bound([meta.session, 0], [meta.session, Infinity]))
      )) as { index: number; blob: Blob }[];
      rows.sort((a, b) => a.index - b.index);
      const chunks = rows.map((r) => r.blob);
      const sizeBytes = chunks.reduce((sum, c) => sum + c.size, 0);
      if (sizeBytes > 0) backups.push({ ...meta, chunks, sizeBytes });
    }
    return backups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

/** Efface les copies de plus de 30 jours, pour ne pas remplir le téléphone. */
export async function pruneOldBackups() {
  try {
    const db = await openDb();
    const tx = db.transaction(SESSIONS, "readonly");
    const sessions = (await result(tx.objectStore(SESSIONS).getAll())) as BackupSession[];
    const limit = new Date(Date.now() - MAX_AGE_MS).toISOString();
    for (const meta of sessions) {
      if (meta.updatedAt < limit) await deleteBackup(meta.session);
    }
  } catch {
    // rien à faire
  }
}
