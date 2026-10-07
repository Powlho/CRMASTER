"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  FileAudio,
  Loader2,
  NotebookText,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";
import type { AudioFile, Meeting } from "@/lib/types";
import { useConfigStatus } from "@/lib/useConfigStatus";
import { readApiResponse, uploadAudio } from "@/lib/uploadAudio";

const TRANSCRIPTION_LABELS: Record<Meeting["transcriptionStatus"], string> = {
  indisponible: "Choisissez d'abord un fichier audio",
  en_attente_outil: "Prête — cliquez sur « Lancer la transcription »",
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
  const [library, setLibrary] = useState<AudioFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshLibrary() {
    try {
      const res = await fetch("/api/audio");
      const data = await res.json();
      if (res.ok) setLibrary(data.files);
    } catch {
      // Bibliothèque indisponible : on garde la liste actuelle.
    }
  }

  useEffect(() => {
    refreshLibrary();
  }, [meeting.audioId]);

  function selectAudio(audioId: string) {
    onUpdate({
      audioId: audioId || undefined,
      transcriptionStatus:
        meeting.transcriptionStatus === "indisponible" && audioId
          ? "en_attente_outil"
          : meeting.transcriptionStatus,
    });
  }

  async function handleImportFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const saved = await uploadAudio(file, file.name, file.name.replace(/\.[^.]+$/, ""));
      selectAudio(saved.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateTranscription() {
    setError(null);
    let request: RequestInit;
    if (meeting.audioId) {
      request = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioId: meeting.audioId }),
      };
    } else if (audioBlob) {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      request = { method: "POST", body: formData };
    } else {
      setError("Choisissez un fichier audio de la bibliothèque ou importez-en un.");
      return;
    }

    const previousStatus = meeting.transcriptionStatus;
    onUpdate({ transcriptionStatus: "en_cours" });
    try {
      const res = await fetch("/api/transcribe", request);
      const data = await readApiResponse<{ transcriptId: string }>(res).catch((err: Error) => {
        setError(err.message);
        return null;
      });
      if (!data) {
        onUpdate({ transcriptionStatus: previousStatus === "terminee" ? "terminee" : "en_attente_outil" });
        return;
      }
      onUpdate({ assemblyTranscriptId: data.transcriptId });
    } catch {
      setError("Impossible de contacter le serveur de transcription.");
      onUpdate({ transcriptionStatus: previousStatus === "terminee" ? "terminee" : "en_attente_outil" });
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

  // Dès que la transcription est prête et Notion configuré, on pousse la page automatiquement.
  useEffect(() => {
    if (meeting.transcriptionStatus !== "terminee") return;
    if (meeting.notionStatus === "envoyee") return;
    if (!config?.notion) return;
    if (sendingToNotion) return;
    handleSendToNotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.transcriptionStatus, meeting.notionStatus, config?.notion]);

  const hasAudio = Boolean(meeting.audioId || audioBlob);
  const isTranscribing = meeting.transcriptionStatus === "en_cours";
  const canTranscribe =
    Boolean(config?.assemblyAI) &&
    hasAudio &&
    meeting.status !== "enregistrement_en_cours" &&
    !isTranscribing;
  const selectedInLibrary = library.some((f) => f.id === meeting.audioId);
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
        Choisissez l&apos;audio à transcrire, lancez la transcription (AssemblyAI) ; le compte
        rendu est ensuite envoyé vers votre base Notion.
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <FileAudio size={16} className="text-slate-400" />
            <p className="text-sm font-medium text-slate-800">Fichier audio</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={meeting.audioId ?? ""}
              onChange={(e) => selectAudio(e.target.value)}
              disabled={isTranscribing}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">
                {audioBlob ? "Enregistrement de cet onglet" : "— Choisir dans la bibliothèque —"}
              </option>
              {meeting.audioId && !selectedInLibrary && (
                <option value={meeting.audioId}>Fichier introuvable dans la bibliothèque</option>
              )}
              {library.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || isTranscribing}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? "Import…" : "Importer un fichier"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {meeting.audioId && selectedInLibrary && (
            <audio
              controls
              preload="none"
              src={`/api/audio/${meeting.audioId}/file`}
              className="mt-3 w-full"
            />
          )}
          <p className="mt-2 text-xs text-slate-400">
            Les audios de vidéos (YouTube…) se récupèrent depuis la page{" "}
            <Link href="/audio" className="text-brand-600 hover:underline">
              Bibliothèque audio
            </Link>
            .
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isTranscribing ? (
                <Loader2 size={16} className="animate-spin text-brand-500" />
              ) : meeting.transcriptionStatus === "terminee" ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : null}
              <div>
                <p className="text-sm font-medium text-slate-800">Transcription</p>
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
                  : !hasAudio
                    ? "Choisissez d'abord un fichier audio"
                    : undefined
              }
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                canTranscribe
                  ? "bg-brand-500 text-white hover:bg-brand-600"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              <Play size={12} fill="currentColor" />
              {meeting.transcriptionStatus === "terminee" ? "Relancer" : "Lancer la transcription"}
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

    </div>
  );
}
