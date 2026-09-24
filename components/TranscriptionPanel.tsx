"use client";

import { useEffect, useRef, useState } from "react";
import type { Meeting } from "@/lib/types";
import { useConfigStatus } from "@/lib/useConfigStatus";

const TRANSCRIPTION_LABELS: Record<Meeting["transcriptionStatus"], string> = {
  indisponible: "Disponible après l'enregistrement",
  en_attente_outil: "Prête à être lancée",
  en_cours: "Transcription en cours…",
  terminee: "Transcription terminée",
};

const NOTION_LABELS: Record<Meeting["notionStatus"], string> = {
  non_configure: "Pas encore envoyée",
  a_envoyer: "Prête à être envoyée",
  envoyee: "Envoyée sur Notion",
};

interface TranscriptionPanelProps {
  meeting: Meeting;
  audioBlob: Blob | null;
  onUpdate: (patch: Partial<Meeting>) => void;
}

export default function TranscriptionPanel({
  meeting,
  audioBlob,
  onUpdate,
}: TranscriptionPanelProps) {
  const config = useConfigStatus();
  const [error, setError] = useState<string | null>(null);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [sendingToNotion, setSendingToNotion] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (meeting.transcriptionStatus !== "en_cours" || !meeting.assemblyTranscriptId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/transcribe/${meeting.assemblyTranscriptId}`);
        const data = await res.json();
        if (!res.ok || data.status === "error") {
          setError(data.error || "La transcription a échoué.");
          onUpdate({ transcriptionStatus: "en_attente_outil" });
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        if (data.status === "completed") {
          onUpdate({
            transcriptionStatus: "terminee",
            transcriptText: data.text ?? "",
            transcriptSummary: data.summary ?? undefined,
            notionStatus: "a_envoyer",
          });
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        setError("Impossible de contacter le serveur de transcription.");
      }
    };

    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.transcriptionStatus, meeting.assemblyTranscriptId]);

  async function handleGenerateTranscription() {
    setError(null);
    if (!audioBlob) {
      setError(
        "L'enregistrement audio n'est plus disponible dans cet onglet. Relancez un enregistrement pour lancer la transcription."
      );
      return;
    }

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    onUpdate({ transcriptionStatus: "en_cours" });
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Échec du lancement de la transcription.");
        onUpdate({ transcriptionStatus: "en_attente_outil" });
        return;
      }
      onUpdate({ assemblyTranscriptId: data.transcriptId });
    } catch {
      setError("Impossible de contacter le serveur de transcription.");
      onUpdate({ transcriptionStatus: "en_attente_outil" });
    }
  }

  async function handleSendToNotion() {
    setNotionError(null);
    setSendingToNotion(true);
    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: meeting.title,
          date: meeting.date,
          time: meeting.time,
          type: meeting.type === "visio" ? "Visioconférence" : "Présentiel",
          participants: meeting.participants,
          summary: meeting.transcriptSummary ?? null,
          transcript: meeting.transcriptText ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotionError(data.error || "Échec de l'envoi vers Notion.");
        return;
      }
      onUpdate({ notionStatus: "envoyee", notionPageUrl: data.url });
    } catch {
      setNotionError("Impossible de contacter Notion.");
    } finally {
      setSendingToNotion(false);
    }
  }

  const hasRecording =
    meeting.status !== "planifiee" && meeting.status !== "enregistrement_en_cours";
  const canTranscribe =
    Boolean(config?.assemblyAI) &&
    hasRecording &&
    meeting.transcriptionStatus !== "en_cours" &&
    meeting.transcriptionStatus !== "terminee";
  const canSendToNotion =
    Boolean(config?.notion) &&
    meeting.transcriptionStatus === "terminee" &&
    meeting.notionStatus !== "envoyee";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Transcription &amp; Notion</h2>
      <p className="mb-5 text-sm text-slate-500">
        Transcription automatique via AssemblyAI, puis envoi vers votre base Notion.
      </p>

      <div className="space-y-4">
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Transcription automatique</p>
              <p className="text-xs text-slate-500">
                {TRANSCRIPTION_LABELS[meeting.transcriptionStatus]}
              </p>
            </div>
            <button
              onClick={handleGenerateTranscription}
              disabled={!canTranscribe}
              title={
                !config?.assemblyAI
                  ? "Configurez ASSEMBLYAI_API_KEY côté serveur"
                  : undefined
              }
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                canTranscribe
                  ? "bg-brand-500 text-white hover:bg-brand-600"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              Générer la transcription
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {meeting.transcriptSummary && (
            <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">Résumé</p>
              <p className="whitespace-pre-wrap">{meeting.transcriptSummary}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Envoi vers Notion</p>
              <p className="text-xs text-slate-500">{NOTION_LABELS[meeting.notionStatus]}</p>
            </div>
            <button
              onClick={handleSendToNotion}
              disabled={!canSendToNotion || sendingToNotion}
              title={
                !config?.notion
                  ? "Configurez NOTION_API_KEY et NOTION_DATABASE_ID côté serveur"
                  : undefined
              }
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                canSendToNotion && !sendingToNotion
                  ? "bg-brand-500 text-white hover:bg-brand-600"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              {sendingToNotion ? "Envoi…" : "Envoyer vers Notion"}
            </button>
          </div>
          {notionError && <p className="mt-2 text-xs text-red-600">{notionError}</p>}
          {meeting.notionPageUrl && (
            <a
              href={meeting.notionPageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline"
            >
              Ouvrir la page Notion →
            </a>
          )}
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
