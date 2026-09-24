"use client";

import type { Meeting } from "@/lib/types";

const TRANSCRIPTION_LABELS: Record<Meeting["transcriptionStatus"], string> = {
  indisponible: "Disponible après l'enregistrement",
  en_attente_outil: "En attente de configuration d'un outil de transcription",
  en_cours: "Transcription en cours",
  terminee: "Transcription terminée",
};

const NOTION_LABELS: Record<Meeting["notionStatus"], string> = {
  non_configure: "Compte Notion non connecté",
  a_envoyer: "Prête à être envoyée",
  envoyee: "Envoyée sur Notion",
};

export default function TranscriptionPanel({ meeting }: { meeting: Meeting }) {
  const hasRecording = meeting.status !== "planifiee" && meeting.status !== "enregistrement_en_cours";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Transcription &amp; Notion</h2>
      <p className="mb-5 text-sm text-slate-500">
        Cette étape sera activée une fois l&apos;outil de transcription choisi et le compte
        Notion connecté (page Paramètres).
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Transcription automatique</p>
            <p className="text-xs text-slate-500">{TRANSCRIPTION_LABELS[meeting.transcriptionStatus]}</p>
          </div>
          <button
            disabled
            title="Choisissez un outil de transcription dans Paramètres"
            className="cursor-not-allowed rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500"
          >
            Générer la transcription
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Envoi vers Notion</p>
            <p className="text-xs text-slate-500">{NOTION_LABELS[meeting.notionStatus]}</p>
          </div>
          <button
            disabled
            title="Connectez votre compte Notion dans Paramètres"
            className="cursor-not-allowed rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500"
          >
            Envoyer vers Notion
          </button>
        </div>
      </div>

      {!hasRecording && (
        <p className="mt-4 text-xs text-slate-400">
          Terminez d&apos;abord l&apos;enregistrement de cette réunion.
        </p>
      )}
    </div>
  );
}
