"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileDown,
  Loader2,
  NotebookText,
  Pencil,
  Printer,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import type { Meeting } from "@/lib/types";
import { useMeetings } from "@/lib/store";
import { useConfigStatus } from "@/lib/useConfigStatus";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { getReportFormat } from "@/lib/reportFormats";
import {
  reportAsText,
  speakerLabel,
  speakersOf,
  transcriptAsText,
  transcriptTurns,
} from "@/lib/meetingText";

const TRANSCRIPTION_LABELS: Record<Meeting["transcriptionStatus"], string> = {
  indisponible: "Disponible après l'enregistrement",
  en_attente_outil: "Démarre automatiquement après l'enregistrement",
  en_cours: "Transcription en cours…",
  terminee: "Transcription terminée",
};

// Un audio sauvegardé il y a moins longtemps que ça et pas encore transcrit est transcrit
// à l'ouverture de la page (cas d'un envoi terminé pendant qu'on était sur une autre page).
const AUTO_START_WINDOW_MS = 10 * 60 * 1000;

interface TranscriptionPanelProps {
  meeting: Meeting;
  onUpdate: (patch: Partial<Meeting>) => void;
}

// navigator.clipboard n'existe qu'en HTTPS : repli sur l'ancienne méthode sinon.
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // on tente le repli
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

function EditableText({
  title,
  value,
  onSave,
  actions,
  busy,
}: {
  title: string;
  value: string;
  onSave: (text: string) => void;
  actions?: React.ReactNode;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3 text-xs text-slate-700">
      <div className="mb-1 flex items-center gap-2">
        {busy && <Loader2 size={12} className="animate-spin text-violet-500" />}
        <p className="font-semibold text-violet-700">{title}</p>
        <div className="ml-auto flex items-center gap-3">
          {!editing && actions}
          {!editing && value && (
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
            >
              <Pencil size={12} />
              Modifier
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(24, Math.max(6, draft.split("\n").length + 1))}
            className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs leading-relaxed text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => {
                onSave(draft.trim());
                setEditing(false);
              }}
              className="rounded-lg bg-brand-500 px-3 py-1.5 font-medium text-white hover:bg-brand-600"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-slate-500 hover:underline"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : value ? (
        <p className="whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-slate-500">{busy ? "Génération en cours…" : "Pas encore disponible."}</p>
      )}
    </div>
  );
}

function SpeakerNames({
  meeting,
  onSave,
}: {
  meeting: Meeting;
  onSave: (names: Record<string, string>) => void;
}) {
  const speakers = speakersOf(meeting);
  const [names, setNames] = useState<Record<string, string>>(meeting.speakerNames ?? {});
  const participants = meeting.participants
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (speakers.length === 0) return null;

  // Premier passage un peu long de chaque voix, pour aider à la reconnaître.
  function sample(speaker: string): string {
    const utterances = meeting.transcriptUtterances ?? [];
    const u =
      utterances.find((x) => x.speaker === speaker && x.text.length > 40) ??
      utterances.find((x) => x.speaker === speaker);
    if (!u) return "";
    return u.text.length > 110 ? `${u.text.slice(0, 110)}…` : u.text;
  }

  function commit(next: Record<string, string>) {
    const cleaned = Object.fromEntries(
      Object.entries(next)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v)
    );
    if (JSON.stringify(cleaned) !== JSON.stringify(meeting.speakerNames ?? {})) onSave(cleaned);
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Users size={13} />
        Intervenants
      </p>
      <p className="mb-3 text-xs text-slate-500">
        Donnez un nom à chaque voix détectée : il remplace « Intervenant A » dans la
        transcription, la copie, les exports et Notion.
      </p>
      <datalist id={`participants-${meeting.id}`}>
        {participants.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="space-y-3">
        {speakers.map((speaker) => (
          <div
            key={speaker}
            className="grid gap-1 sm:grid-cols-[10rem,1fr] sm:items-start sm:gap-3"
          >
            <input
              value={names[speaker] ?? ""}
              list={`participants-${meeting.id}`}
              placeholder={`Intervenant ${speaker}`}
              aria-label={`Nom de l'intervenant ${speaker}`}
              onChange={(e) => setNames((prev) => ({ ...prev, [speaker]: e.target.value }))}
              onBlur={() => commit(names)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <p className="text-xs italic text-slate-500">« {sample(speaker)} »</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TranscriptionPanel({ meeting, onUpdate }: TranscriptionPanelProps) {
  const { syncMeeting, replaceMeeting } = useMeetings();
  const config = useConfigStatus();
  const currentUser = useCurrentUser();
  const [error, setError] = useState<string | null>(null);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [sendingToNotion, setSendingToNotion] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // La transcription automatique ne part qu'une fois par audio et par visite : sinon un
  // échec (statut remis en attente) la relancerait en boucle.
  const initialSavedAtRef = useRef(meeting.audio?.savedAt ?? null);
  const autoStartedRef = useRef<string | null>(null);
  const reportFormat = getReportFormat(meeting.reportFormat);
  const notionReview = Boolean(currentUser?.notionReview);

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
    if (!meeting.audio) {
      setError("Aucun enregistrement audio sauvegardé pour cette réunion.");
      return;
    }

    // Affichage immédiat ; c'est le serveur qui enregistre le nouveau suivi s'il démarre.
    // L'ancien identifiant est retiré pour que le suivi ne reprenne pas un job précédent.
    const previous = {
      transcriptionStatus: meeting.transcriptionStatus,
      assemblyTranscriptId: meeting.assemblyTranscriptId,
    };
    syncMeeting(meeting.id, { transcriptionStatus: "en_cours", assemblyTranscriptId: undefined });
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId: meeting.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Échec du lancement de la transcription.");
        syncMeeting(meeting.id, {
          ...previous,
          transcriptionStatus:
            previous.transcriptionStatus === "terminee" ? "terminee" : "en_attente_outil",
        });
        return;
      }
      syncMeeting(meeting.id, {
        transcriptionStatus: "en_cours",
        assemblyTranscriptId: data.transcriptId,
      });
    } catch {
      setError("Impossible de contacter le serveur de transcription.");
      syncMeeting(meeting.id, previous);
    }
  }

  // Résumé et compte rendu mis en forme : générés par le serveur à partir de la transcription
  // enregistrée (avec les noms des intervenants).
  async function generate(kind: "summary" | "report"): Promise<string> {
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId: meeting.id, kind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.text) throw new Error(data.error || "Échec de la génération.");
    return data.text as string;
  }

  async function handleGenerateReport() {
    if (!reportFormat.prompt) return;
    setReportError(null);
    setGeneratingReport(true);
    try {
      onUpdate({ formattedReport: await generate("report") });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Impossible de contacter le serveur.");
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleGenerateSummary() {
    setSummaryError(null);
    setGeneratingSummary(true);
    try {
      onUpdate({ transcriptSummary: await generate("summary") });
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Impossible de contacter le serveur.");
    } finally {
      setGeneratingSummary(false);
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
          utterances:
            meeting.transcriptUtterances?.map((u) => ({
              speaker: speakerLabel(meeting, u.speaker),
              text: u.text,
            })) ?? null,
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

  async function handleCopy(kind: "report" | "transcript") {
    const text = kind === "report" ? reportAsText(meeting) : transcriptAsText(meeting);
    const ok = await copyText(text);
    setCopied(ok ? kind : "error");
    setTimeout(() => setCopied(null), 2500);
  }

  // Sondage du statut de transcription tant qu'un job AssemblyAI est en cours.
  useEffect(() => {
    if (meeting.transcriptionStatus !== "en_cours" || !meeting.assemblyTranscriptId) return;

    const poll = async () => {
      try {
        // Le serveur enregistre lui-même le résultat ; on reprend sa version de la réunion.
        const res = await fetch(
          `/api/transcribe/${meeting.assemblyTranscriptId}?meetingId=${meeting.id}`
        );
        const data = await res.json().catch(() => ({}));
        if (data.meeting) replaceMeeting(data.meeting as Meeting);
        if (!res.ok || data.status === "error") {
          setError(data.error || "La transcription a échoué.");
          if (!data.meeting) syncMeeting(meeting.id, { transcriptionStatus: "en_attente_outil" });
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        if (data.status === "completed") {
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

  // Dès que l'audio est sauvegardé sur le serveur et AssemblyAI configuré, on lance la
  // transcription sans attendre un clic.
  useEffect(() => {
    const savedAt = meeting.audio?.savedAt;
    if (!savedAt) return;
    const fresh =
      savedAt !== initialSavedAtRef.current ||
      Date.now() - new Date(savedAt).getTime() < AUTO_START_WINDOW_MS;
    if (!fresh) return;
    if (autoStartedRef.current === savedAt) return;
    if (!config?.assemblyAI) return;
    if (meeting.transcriptionStatus !== "en_attente_outil") return;
    autoStartedRef.current = savedAt;
    handleGenerateTranscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.audio?.savedAt, config?.assemblyAI, meeting.transcriptionStatus]);

  // Dès que la transcription est prête, on génère le résumé.
  useEffect(() => {
    if (meeting.transcriptionStatus !== "terminee") return;
    if (meeting.transcriptSummary !== undefined) return;
    if (!config?.assemblyAI) return;
    if (generatingSummary || summaryError) return;
    handleGenerateSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.transcriptionStatus, meeting.transcriptSummary, config?.assemblyAI]);

  // Dès que la transcription est prête, on génère aussi le compte rendu mis en forme (si un format
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
  // Notion configuré et activé pour ce compte, on pousse la page automatiquement — sauf si
  // le compte a choisi de relire avant l'envoi.
  useEffect(() => {
    if (meeting.transcriptionStatus !== "terminee") return;
    if (reportFormat.prompt && !meeting.formattedReport) return;
    // On attend le résumé, sauf s'il a échoué (la page part alors sans).
    if (meeting.transcriptSummary === undefined && !summaryError) return;
    if (meeting.notionStatus === "envoyee") return;
    if (!config?.notion) return;
    if (!currentUser?.notionEnabled || currentUser.notionReview) return;
    if (sendingToNotion) return;
    handleSendToNotion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    meeting.transcriptionStatus,
    meeting.formattedReport,
    meeting.transcriptSummary,
    summaryError,
    meeting.notionStatus,
    config?.notion,
    currentUser?.notionEnabled,
    currentUser?.notionReview,
  ]);

  const hasRecording = Boolean(meeting.audio);
  const isTranscribing = meeting.transcriptionStatus === "en_cours";
  const isDone = meeting.transcriptionStatus === "terminee";
  const canTranscribe = Boolean(config?.assemblyAI) && hasRecording && !isTranscribing;
  const reportReady = !reportFormat.prompt || Boolean(meeting.formattedReport);
  const canSendToNotion =
    Boolean(config?.notion) && Boolean(currentUser?.notionEnabled) && isDone && reportReady;
  const notionLabel =
    meeting.notionStatus === "envoyee"
      ? "Envoyée sur Notion"
      : !isDone
        ? "Après la transcription"
        : notionReview
          ? "Relisez et corrigez le compte rendu, puis envoyez-le"
          : "Envoi automatique en cours…";
  const turns = transcriptTurns(meeting);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Sparkles size={18} />
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          Transcription &amp; compte rendu
        </h2>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        {currentUser?.notionEnabled
          ? notionReview
            ? "Automatique via AssemblyAI ; vous relisez avant l'envoi vers Notion."
            : "Automatique via AssemblyAI, puis envoi vers votre base Notion — sans action requise."
          : "Automatique via AssemblyAI — sans action requise."}
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isTranscribing ? (
                <Loader2 size={16} className="animate-spin text-brand-500" />
              ) : isDone ? (
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
              onClick={() => {
                if (
                  isDone &&
                  !window.confirm(
                    "Relancer la transcription ? Le texte actuel, les noms des intervenants et le compte rendu seront remplacés."
                  )
                ) {
                  return;
                }
                handleGenerateTranscription();
              }}
              disabled={!canTranscribe}
              title={
                !config?.assemblyAI
                  ? "Configurez ASSEMBLYAI_API_KEY côté serveur"
                  : !hasRecording
                    ? "Enregistrez ou importez d'abord un audio"
                    : undefined
              }
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                canTranscribe
                  ? isDone
                    ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    : "bg-brand-500 text-white hover:bg-brand-600"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              }`}
            >
              {isDone ? "Relancer" : "Générer la transcription"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          {isDone && (
            <>
              <SpeakerNames
                key={meeting.assemblyTranscriptId ?? "none"}
                meeting={meeting}
                onSave={(speakerNames) => onUpdate({ speakerNames })}
              />

              {reportFormat.prompt && (
                <EditableText
                  title={reportFormat.label}
                  value={meeting.formattedReport ?? ""}
                  busy={generatingReport}
                  onSave={(formattedReport) => onUpdate({ formattedReport })}
                  actions={
                    meeting.formattedReport && !generatingReport ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Régénérer le compte rendu (en tenant compte des noms des intervenants) ? Vos modifications seront remplacées."
                            )
                          ) {
                            handleGenerateReport();
                          }
                        }}
                        className="inline-flex items-center gap-1 font-medium text-slate-500 hover:underline"
                      >
                        <RefreshCw size={12} />
                        Régénérer
                      </button>
                    ) : null
                  }
                />
              )}
              {reportError && <p className="mt-2 text-xs text-red-600">{reportError}</p>}

              <EditableText
                title="Résumé"
                value={meeting.transcriptSummary ?? ""}
                busy={generatingSummary}
                onSave={(transcriptSummary) => onUpdate({ transcriptSummary })}
                actions={
                  !generatingSummary ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !meeting.transcriptSummary ||
                          window.confirm("Régénérer le résumé ? Vos modifications seront remplacées.")
                        ) {
                          handleGenerateSummary();
                        }
                      }}
                      className="inline-flex items-center gap-1 font-medium text-slate-500 hover:underline"
                    >
                      <RefreshCw size={12} />
                      {meeting.transcriptSummary ? "Régénérer" : "Générer"}
                    </button>
                  ) : null
                }
              />
              {summaryError && <p className="mt-2 text-xs text-red-600">{summaryError}</p>}

              {turns.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowTranscript((s) => !s)}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    {showTranscript
                      ? "Masquer la transcription complète"
                      : "Voir la transcription complète"}
                  </button>
                  {showTranscript && (
                    <div className="mt-2 max-h-96 space-y-2 overflow-y-auto rounded-lg bg-white p-3 text-xs text-slate-600">
                      {turns.map((t, i) => (
                        <p key={i} className="whitespace-pre-wrap">
                          {t.speaker && (
                            <span className="font-semibold text-slate-700">{t.speaker} : </span>
                          )}
                          {t.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => handleCopy("report")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy size={13} />
                  {copied === "report" ? "Copié !" : "Copier le compte rendu"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy("transcript")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Copy size={13} />
                  {copied === "transcript" ? "Copié !" : "Copier la transcription"}
                </button>
                <a
                  href={`/api/meetings/${meeting.id}/export`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileDown size={13} />
                  Word
                </a>
                <a
                  href={`/imprimer/${meeting.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Printer size={13} />
                  PDF / Imprimer
                </a>
                {copied === "error" && (
                  <span className="text-xs text-red-600">
                    Copie impossible sur ce navigateur : sélectionnez le texte à la main.
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {currentUser?.notionEnabled ? (
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
                  <p className="text-xs text-slate-500">{notionLabel}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    meeting.notionStatus === "envoyee" &&
                    !window.confirm(
                      "Cette réunion est déjà sur Notion. Créer une nouvelle page avec la version actuelle ? (L'ancienne page n'est pas supprimée.)"
                    )
                  ) {
                    return;
                  }
                  handleSendToNotion();
                }}
                disabled={!canSendToNotion || sendingToNotion}
                title={
                  !config?.notion
                    ? "Configurez NOTION_API_KEY et NOTION_DATABASE_ID côté serveur"
                    : undefined
                }
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  canSendToNotion && !sendingToNotion
                    ? meeting.notionStatus === "envoyee"
                      ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      : "bg-brand-500 text-white hover:bg-brand-600"
                    : "cursor-not-allowed bg-slate-200 text-slate-500"
                }`}
              >
                {sendingToNotion
                  ? "Envoi…"
                  : meeting.notionStatus === "envoyee"
                    ? "Renvoyer"
                    : notionReview
                      ? "Valider et envoyer"
                      : "Envoyer vers Notion"}
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
        ) : currentUser ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Notion n&apos;est pas activé pour votre compte. Utilisez « Copier le compte rendu »
            pour le coller où vous en avez besoin (Doctolib, mail…).
          </div>
        ) : null}
      </div>
    </div>
  );
}
