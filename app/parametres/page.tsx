"use client";

import { useConfigStatus } from "@/lib/useConfigStatus";

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

export default function SettingsPage() {
  const config = useConfigStatus();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Paramètres</h1>
      <p className="mb-8 text-sm text-slate-500">
        La transcription est assurée par AssemblyAI et les comptes-rendus sont poussés vers
        une base Notion. Les identifiants se configurent côté serveur, via variables
        d&apos;environnement (jamais dans le navigateur).
      </p>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">AssemblyAI (transcription)</h2>
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

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Notion</h2>
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
        </ol>
      </section>
    </div>
  );
}
