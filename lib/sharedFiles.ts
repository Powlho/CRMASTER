"use client";

// Fichiers reçus via le menu « Partager » d'Android, rangés par le service worker
// (public/sw.js — même base IndexedDB, même structure).

const DB_NAME = "crmaster-share";
const STORE = "files";

export interface SharedFile {
  id: number;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
  title: string;
  text: string;
  receivedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listSharedFiles(): Promise<SharedFile[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as SharedFile[]).sort((a, b) => a.id - b.id));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteSharedFile(id: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // rien à faire
  }
}
