// Service worker de CRMASTER. Son seul rôle : recevoir les fichiers audio partagés depuis
// une autre application Android (Enregistreur Google…) via le menu « Partager ».
// Android envoie le fichier par un POST vers /partager-cible ; on le range dans IndexedDB
// puis on ouvre la page /partager, qui le rattache à une nouvelle réunion.
// Aucune mise en cache : l'application fonctionne exactement comme dans le navigateur.

const SHARE_ACTION = "/partager-cible";
const DB_NAME = "crmaster-share";
const STORE = "files";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === SHARE_ACTION) {
    event.respondWith(receiveShare(event.request));
  }
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function receiveShare(request) {
  const target = new URL("/partager", self.location.origin);
  try {
    const form = await request.formData();
    const files = form.getAll("audio").filter((f) => typeof f === "object" && f.size > 0);
    if (files.length === 0) {
      target.searchParams.set("erreur", "vide");
      return Response.redirect(target.href, 303);
    }
    const title = String(form.get("title") || "");
    const text = String(form.get("text") || "");
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const file of files) {
        store.add({
          blob: file,
          name: file.name || "",
          type: file.type || "",
          lastModified: file.lastModified || Date.now(),
          title,
          text,
          receivedAt: new Date().toISOString(),
        });
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    target.searchParams.set("erreur", "lecture");
  }
  return Response.redirect(target.href, 303);
}
