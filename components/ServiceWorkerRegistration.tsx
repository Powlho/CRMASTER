"use client";

import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/installPrompt";

// Enregistre le service worker (réception des fichiers partagés depuis Android) et garde la
// proposition d'installation de Chrome. Les deux n'existent qu'en HTTPS.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    captureInstallPrompt();
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // sans service worker, l'appli fonctionne ; seul le partage Android est indisponible
      });
    }
  }, []);
  return null;
}
