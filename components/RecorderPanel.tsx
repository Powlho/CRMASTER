"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MonitorUp, Square, TriangleAlert } from "lucide-react";
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

interface RecorderPanelProps {
  meeting: Meeting;
  onRecordingComplete?: (blob: Blob) => void;
}

export default function RecorderPanel({ meeting, onRecordingComplete }: RecorderPanelProps) {
  const { updateMeeting } = useMeetings();
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micOnlyWarning, setMicOnlyWarning] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksToStopRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cleanupMedia() {
    tracksToStopRef.current.forEach((t) => t.stop());
    tracksToStopRef.current = [];
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupMedia();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    setError(null);
    setMicOnlyWarning(false);
    setState("requesting");
    try {
      let stream: MediaStream;

      if (meeting.type === "presentiel") {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tracksToStopRef.current = micStream.getTracks();
        stream = micStream;
      } else {
        // Capture le son partagé (onglet, fenêtre d'appli type Teams/Zoom, ou tout l'écran)
        // ET le micro, puis mixe les deux pistes pour garder les deux côtés de la conversation.
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          micStream = null;
        }

        const displayAudioTracks = displayStream.getAudioTracks();
        displayStream.getVideoTracks().forEach((t) => t.stop());

        if (displayAudioTracks.length === 0) {
          setMicOnlyWarning(true);
          if (!micStream) {
            throw new Error(
              "Aucun son partagé et aucun micro disponible. Réessayez en cochant « Partager l'audio du système »."
            );
          }
          tracksToStopRef.current = micStream.getTracks();
          stream = micStream;
        } else {
          const audioContext = new AudioContext();
          audioContextRef.current = audioContext;
          const destination = audioContext.createMediaStreamDestination();

          audioContext
            .createMediaStreamSource(new MediaStream(displayAudioTracks))
            .connect(destination);
          if (micStream) {
            audioContext.createMediaStreamSource(micStream).connect(destination);
          } else {
            setMicOnlyWarning(false);
          }

          tracksToStopRef.current = [
            ...displayAudioTracks,
            ...(micStream ? micStream.getTracks() : []),
          ];
          stream = destination.stream;
        }
      }

      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        cleanupMedia();
        onRecordingComplete?.(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setState("recording");
      updateMeeting(meeting.id, { status: "enregistrement_en_cours" });

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      cleanupMedia();
      setState("error");
      setError(
        err instanceof Error ? err.message : "Impossible de démarrer l'enregistrement."
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
            {meeting.type === "presentiel" ? <Mic size={18} /> : <MonitorUp size={18} />}
          </div>
          <h2 className="text-base font-semibold text-slate-900">Enregistrement</h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {meeting.type === "presentiel"
            ? "L'enregistrement utilisera le microphone de cet appareil."
            : "Partagez la fenêtre de Teams/Zoom (ou tout l'écran) et cochez « Partager l'audio du système » — votre micro sera capturé en parallèle pour garder les deux côtés de la conversation. Sur macOS, le partage du son système n'est pas géré nativement par le navigateur : seul votre micro sera alors enregistré, sauf pilote audio virtuel (ex. BlackHole)."}
        </p>
        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        <button
          onClick={startRecording}
          disabled={state === "requesting"}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          {state === "requesting" ? "Autorisation en cours…" : "Démarrer l'enregistrement"}
        </button>
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="rec-dot absolute inline-flex h-full w-full rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-medium text-red-700">Enregistrement en cours</span>
          <span className="ml-auto font-mono text-lg tabular-nums text-slate-900">
            {formatDuration(seconds)}
          </span>
        </div>
        {micOnlyWarning && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            Aucun audio système détecté : seul votre micro est enregistré pour l&apos;instant.
          </p>
        )}
        <button
          onClick={stopRecording}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          <Square size={14} fill="currentColor" />
          Arrêter l&apos;enregistrement
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
        L&apos;audio est envoyé automatiquement à votre serveur pour être transcrit.
      </p>
    </div>
  );
}
