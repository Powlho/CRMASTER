"use client";

const TRANSCRIPTION_TOOLS = [
  { name: "Whisper (OpenAI / self-hosted)", note: "Bonne qualité, coût maîtrisable" },
  { name: "Deepgram", note: "Transcription temps réel, API simple" },
  { name: "AssemblyAI", note: "Résumés et extraction de points d'action inclus" },
  { name: "Notion AI", note: "Intégration native avec vos pages Notion" },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Paramètres</h1>
      <p className="mb-8 text-sm text-slate-500">
        Ces intégrations seront activées lors de la prochaine étape.
      </p>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Compte Notion</h2>
            <p className="mt-1 text-sm text-slate-500">
              Les transcriptions seront poussées automatiquement vers une base Notion de
              votre choix.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            Non connecté
          </span>
        </div>
        <button
          disabled
          title="La connexion Notion sera configurée à l'étape suivante"
          className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500"
        >
          Connecter Notion
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Outil de transcription</h2>
        <p className="mb-4 text-sm text-slate-500">
          À choisir ensemble à la prochaine étape. Quelques pistes :
        </p>
        <ul className="space-y-2">
          {TRANSCRIPTION_TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{tool.name}</p>
                <p className="text-xs text-slate-500">{tool.note}</p>
              </div>
              <input type="radio" name="transcription-tool" disabled />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
