"use client";

import { useEffect, useState } from "react";
import { Lock, Mic, NotebookText, SlidersHorizontal, Smartphone } from "lucide-react";
import { useConfigStatus } from "@/lib/useConfigStatus";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  getInstallPrompt,
  isInstalled,
  onInstallPromptChange,
  promptInstall,
} from "@/lib/installPrompt";

function StatusPill({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
        Vérification…
      </span>
    );
  }
  return ok ? (
    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
      Configuré
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
      Non configuré
    </span>
  );
}

function Preferences() {
  const currentUser = useCurrentUser();
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) setReview(currentUser.notionReview);
  }, [currentUser]);

  if (!currentUser?.notionEnabled) return null;

  async function toggle(next: boolean) {
    setReview(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notionReview: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setReview(!next);
      setError("Préférence non enregistrée, réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <SlidersHorizontal size={15} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Mes préférences</h2>
      </div>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={review}
          disabled={saving}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">Relire avant l&apos;envoi vers Notion</span>
          <span className="block text-xs text-slate-500">
            Le compte rendu attend votre validation (après corrections et noms des
            intervenants) au lieu de partir automatiquement dès la fin de la transcription.
          </span>
        </span>
      </label>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}

function InstallApp() {
  const [secure, setSecure] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    setSecure(window.isSecureContext);
    const refresh = () => {
      setInstalled(isInstalled());
      setCanPrompt(Boolean(getInstallPrompt()));
    };
    refresh();
    return onInstallPromptChange(refresh);
  }, []);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Smartphone size={15} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Application sur le téléphone</h2>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        Installée sur votre téléphone Android, CRMASTER a son icône sur l&apos;écran
        d&apos;accueil et apparaît dans le menu <strong>Partager</strong> : depuis
        l&apos;Enregistreur Google, Partager → Fichier audio → CRMASTER crée la réunion et lance
        la transcription.
      </p>
      {installed ? (
        <p className="text-sm font-medium text-emerald-600">
          Application installée sur cet appareil.
        </p>
      ) : !secure ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          L&apos;installation nécessite une connexion sécurisée : ouvrez CRMASTER via son adresse
          en https:// sur votre téléphone.
        </p>
      ) : canPrompt ? (
        <button
          onClick={() => promptInstall()}
          className="rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
        >
          Installer l&apos;application
        </button>
      ) : (
        <p className="text-sm text-slate-500">
          Sur votre téléphone, dans Chrome : menu <strong>⋮</strong> →{" "}
          <strong>Installer l&apos;application</strong> (ou « Ajouter à l&apos;écran
          d&apos;accueil »).
        </p>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const config = useConfigStatus();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Paramètres</h1>
      <p className="mb-8 text-sm text-slate-500">
        La transcription est assurée par AssemblyAI et les comptes-rendus sont poussés vers
        une base Notion. Les identifiants se configurent côté serveur, via variables
        d&apos;environnement (jamais dans le navigateur).
      </p>

      <Preferences />
      <InstallApp />

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
              <Lock size={15} />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Accès (mot de passe)</h2>
          </div>
          <StatusPill ok={config?.auth} />
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            Générez une clé de signature (dans un terminal sur le serveur) :
            <code className="mt-1 block rounded bg-slate-100 px-2 py-1">openssl rand -hex 32</code>
          </li>
          <li>
            Renseignez, dans <code className="rounded bg-slate-100 px-1">.env.local</code>, la clé
            générée et le mot de passe du tout premier compte (administrateur, identifiant{" "}
            <code className="rounded bg-slate-100 px-1">admin</code>) :
            <code className="mt-1 block rounded bg-slate-100 px-2 py-1">
              APP_PASSWORD=mot_de_passe_du_premier_compte_admin
              <br />
              AUTH_SECRET=la_valeur_générée_ci-dessus
            </code>
          </li>
          <li>Redémarrez le serveur, puis connectez-vous avec l&apos;identifiant « admin ».</li>
          <li>
            Créez les autres comptes (ex. pour un autre membre du foyer) depuis la page{" "}
            <strong>Administration</strong> — chacun a sa propre liste de réunions, et
            l&apos;envoi vers Notion s&apos;active individuellement par compte.
          </li>
        </ol>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
              <Mic size={15} />
            </div>
            <h2 className="text-base font-semibold text-slate-900">AssemblyAI (transcription)</h2>
          </div>
          <StatusPill ok={config?.assemblyAI} />
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            Créez un compte sur{" "}
            <a
              href="https://www.assemblyai.com/"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline"
            >
              assemblyai.com
            </a>{" "}
            et récupérez votre clé API.
          </li>
          <li>
            Ajoutez-la dans <code className="rounded bg-slate-100 px-1">.env.local</code> (ou les
            variables d&apos;environnement du serveur) : <br />
            <code className="mt-1 block rounded bg-slate-100 px-2 py-1">
              ASSEMBLYAI_API_KEY=votre_cle
            </code>
          </li>
          <li>Redémarrez le serveur.</li>
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-white">
              <NotebookText size={15} />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Notion</h2>
          </div>
          <StatusPill ok={config?.notion} />
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>
            Créez une intégration sur{" "}
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline"
            >
              notion.so/my-integrations
            </a>{" "}
            et copiez le jeton d&apos;intégration interne.
          </li>
          <li>
            Créez (ou choisissez) une base Notion pour vos réunions, puis partagez-la avec
            l&apos;intégration (bouton « Connecter à » sur la page de la base).
          </li>
          <li>
            Copiez l&apos;identifiant de la base depuis son URL, puis renseignez :
            <code className="mt-1 block rounded bg-slate-100 px-2 py-1">
              NOTION_API_KEY=votre_jeton
              <br />
              NOTION_DATABASE_ID=votre_id_de_base
            </code>
          </li>
          <li>Redémarrez le serveur.</li>
          <li>
            Activez l&apos;envoi vers Notion pour les comptes concernés depuis la page{" "}
            <strong>Administration</strong> (désactivé par défaut, sauf pour l&apos;admin
            initial).
          </li>
        </ol>
      </section>
    </div>
  );
}
