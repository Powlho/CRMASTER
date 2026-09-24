"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  NotebookText,
  Sparkles,
} from "lucide-react";
import type { Meeting } from "@/lib/types";
import { useConfigStatus } from "@/lib/useConfigStatus";
import { getReportFormat } from "@/lib/reportFormats";

const TRANSCRIPTION_LABELS: Record<Meeting["transcriptionStatus"], string> = {
  indisponible: "Disponible après l'enregistrement",
  en_attente_outil: "Démarre automatiquement après l'enregistrement",
  en_cours: "Transcription en cours…",
  terminee: "Transcription terminée",
};

const NOTION_LABELS: Record<Meeting["notionStatus"], string> = {
  non_configure: "Pas encore envoyée",
  a_envoyer: "Envoi automatique en cours…",
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
  const [showTranscript, setShowTranscript] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportFormat = getReportFormat(meeting.reportFormat);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  function notify(title: string, body: string) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(title, { body });
  }

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
    formData.append("profile", meeting.transcriptionProfile || "none");

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

  async function handleGenerateReport() {
    if (!meeting.assemblyTranscriptId || !reportFormat.prompt) return;
    setReportError(null);
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcriptId: meeting.assemblyTranscriptId,
          formatId: meeting.reportFormat,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportError(data.error || "Échec de la génération du compte rendu.");
        return;
      }
      onUpdate({ formattedReport: data.report });
    } catch {
      setReportError("Impossible de contacter le serveur.");
    } finally {
      setGeneratingReport(false);
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
          utterances: meeting.transcriptUtterances ?? null,
          formattedReport: meeting.formattedReport ?? null,
          formattedReportLabel: reportFormat.id !== "brut" ? reportFormat.label : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotionError(data.error || "Échec de l'envoi vers Notion.");
        return;
      }
      onUpdate({ notionStatus: "envoyee", notionPageUrl: data.url });
      notify("Envoyée sur Notion", meeting.title);
    } catch {
      setNotionError("Impossible de contacter Notion.");
    } finally {
      setSendingToNotion(false);
    }
  }

  // Sondage du statut de transcription tant qu'un job AssemblyAI est en cours.
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
            transcriptUtterances: data.utterances ?? undefined,
            notionStatus: "a_envoyer",
          });
          notify("Transcription terminée", meeting.title);
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

  // Dès que l'enregistrement est prêt et AssemblyAI configuré, on lance la transcription
  // sans attendre un clic — c'est l'upload automatique vers le serveur.
  useEffect(() => {
    if (!audioBlob) return;
    if (!config?.assemblyAI) return;
    if (meeting.transcriptionStatus !== "en_attente_outil") return;
    handleGenerateTranscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob, config?.assemblyAI, meeting.transcriptionStatus]);

  // Dès que la transcription est prête, on génère le compte rendu mis en forme (si un format
  // autre que « texte brut » a été choisi) avant d'envoyer vers Notion.
  useEffect(() => {
    if (meeting.transcriptionStatus !== "terminee") return;
    if (!reportFormat.prompt) return;
    if (meeting.formattedReport) return;
    if (!config?.assemblyAI) return;
    if (generatingReport) return;
    handleGenerateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.transcriptionStatus, meeting.formattedReport, config?.assemblyAI]);

  // Dès que la transcription (et le compte rendu mis en forme, le cas échéant) est prête et
  // Notion configuré, on pousse la page automatiquement.
  useEffect(() => {
    if (meeting.transcriptionStatus !== "terminee") return;
    if (reportFormat.prompt && !meeting.formattedReport) return;
    if (meeting.notionStatus === "envoyee") return;
    if (!config?.notion) return;
    if (sendingToNotion) return;
    handleSendToNotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.transcriptionStatus, meeting.formattedReport, meeting.notionStatus, config?.notion]);

  const hasRecording =
    meeting.status !== "planifiee" && meeting.status !== "enregistrement_en_cours";
  const isTranscribing = meeting.transcriptionStatus === "en_cours";
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Sparkles size={18} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">Transcription &amp; Notion</h2>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Automatique via AssemblyAI, puis envoi vers votre base Notion — sans action requise.
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isTranscribing ? (
                <Loader2 size={16} className="animate-spin text-brand-500" />
              ) : meeting.transcriptionStatus === "terminee" ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : null}
              <div>
                <p className="text-sm font-medium text-slate-800">Transcription automatique</p>
                <p className="text-xs text-slate-500">
                  {TRANSCRIPTION_LABELS[meeting.transcriptionStatus]}
                </p>
              </div>
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
              {meeting.transcriptionStatus === "terminee" ? "Relancer" : "Générer la transcription"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {reportFormat.prompt && (
            <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3 text-xs text-slate-700">
              <div className="mb-1 flex items-center gap-2">
                {generatingReport && <Loader2 size={12} className="animate-spin text-violet-500" />}
                <p className="font-semibold text-violet-700">{reportFormat.label}</p>
              </div>
              {meeting.formattedReport ? (
                <p className="whitespace-pre-wrap">{meeting.formattedReport}</p>
              ) : (
                <p className="text-slate-500">
                  {generatingReport ? "Génération en cours…" : "En attente de la transcription."}
                </p>
              )}
              {reportError && <p className="mt-2 text-red-600">{reportError}</p>}
            </div>
          )}
          {meeting.transcriptSummary && (
            <div className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">Résumé</p>
              <p className="whitespace-pre-wrap">{meeting.transcriptSummary}</p>
            </div>
          )}
          {meeting.transcriptText && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowTranscript((s) => !s)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {showTranscript ? "Masquer la transcription complète" : "Voir la transcription complète"}
              </button>
              {showTranscript && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-lg bg-white p-3 text-xs text-slate-600">
                  {meeting.transcriptUtterances && meeting.transcriptUtterances.length > 0 ? (
                    <div className="space-y-2">
                      {meeting.transcriptUtterances.map((u, i) => (
                        <p key={i}>
                          <span className="font-semibold text-slate-700">
                            Intervenant {u.speaker} :{" "}
                          </span>
                          {u.text}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{meeting.transcriptText}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {sendingToNotion ? (
                <Loader2 size={16} className="animate-spin text-brand-500" />
              ) : meeting.notionStatus === "envoyee" ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : (
                <NotebookText size={16} className="text-slate-400" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-800">Envoi vers Notion</p>
                <p className="text-xs text-slate-500">{NOTION_LABELS[meeting.notionStatus]}</p>
              </div>
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
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
            >
              Ouvrir la page Notion <ExternalLink size={12} />
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
