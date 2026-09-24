"use client";

import { useEffect, useRef, useState } from "react";
import type { Meeting } from "@/lib/types";
import { useMeetings } from "@/lib/store";

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function RecorderPanel({ meeting }: { meeting: Meeting }) {
  const { updateMeeting } = useMeetings();
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    setState("requesting");
    try {
      let stream: MediaStream;
      if (meeting.type === "presentiel") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          throw new Error(
            "Aucun son détecté dans le partage. Cochez « Partager l'audio de l'onglet » lors du partage."
          );
        }
        displayStream.getVideoTracks().forEach((t) => t.stop());
        stream = new MediaStream(audioTracks);
      }

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setState("recording");
      updateMeeting(meeting.id, { status: "enregistrement_en_cours" });

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de démarrer l'enregistrement."
      );
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setState("stopped");
    updateMeeting(meeting.id, {
      status: "enregistree",
      recordingDurationSec: seconds,
      transcriptionStatus: "en_attente_outil",
    });
  }

  if (state === "idle" || state === "requesting" || state === "error") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Enregistrement</h2>
        <p className="mb-4 text-sm text-slate-500">
          {meeting.type === "presentiel"
            ? "L'enregistrement utilisera le microphone de cet appareil."
            : "Vous devrez partager l'onglet ou la fenêtre de votre visioconférence avec l'audio activé."}
        </p>
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <button
          onClick={startRecording}
          disabled={state === "requesting"}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-60"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          {state === "requesting" ? "Autorisation en cours…" : "Démarrer l'enregistrement"}
        </button>
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="rec-dot h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm font-medium text-red-700">Enregistrement en cours</span>
          <span className="ml-auto font-mono text-lg tabular-nums text-slate-900">
            {formatDuration(seconds)}
          </span>
        </div>
        <button
          onClick={stopRecording}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          Arrêter l&apos;enregistrement
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Enregistrement terminé</h2>
      <p className="mb-4 text-sm text-slate-500">
        Durée : {formatDuration(meeting.recordingDurationSec ?? seconds)}
      </p>
      {audioUrl && (
        <audio controls src={audioUrl} className="mb-4 w-full">
          Votre navigateur ne supporte pas la lecture audio.
        </audio>
      )}
      <p className="text-xs text-slate-400">
        L&apos;audio reste dans cet onglet pour l&apos;instant. Une fois l&apos;outil de
        transcription branché, il sera envoyé automatiquement pour être transcrit puis
        poussé vers Notion.
      </p>
    </div>
  );
}
