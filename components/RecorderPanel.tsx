"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MonitorUp, Square, TriangleAlert } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { useMeetings } from "@/lib/store";

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";
type CaptureMode = "salle" | "proche";

const MIC_STORAGE_KEY = "crmaster.micDeviceId";
const MODE_STORAGE_KEY = "crmaster.captureMode";
// En dessous de ce niveau RMS pendant QUIET_ALERT_SECONDS, on signale un micro trop faible.
const QUIET_RMS = 0.004;
const QUIET_ALERT_SECONDS = 15;

type WakeLockSentinelLike = { release(): Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // stockage indisponible (navigation privée…) : le choix ne sera juste pas mémorisé
  }
}

// En réunion à plusieurs, les traitements du navigateur (réduction de bruit, gain auto)
// sont pensés pour une seule voix proche : ils atténuent les intervenants éloignés et
// dégradent l'identification des voix. On les coupe en mode « salle ».
function micConstraints(deviceId: string, mode: CaptureMode | "visio"): MediaTrackConstraints {
  const processing = mode !== "salle";
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: mode === "visio" ? true : processing,
    noiseSuppression: processing,
    autoGainControl: processing,
  };
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(
    (t) => MediaRecorder.isTypeSupported(t)
  );
}

function describeMicError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Accès au micro refusé — par le navigateur, par vous, ou par une règle de sécurité de votre entreprise. Vérifiez l'autorisation (icône à gauche de la barre d'adresse). Si votre poste est verrouillé par votre employeur, enregistrez plutôt depuis votre téléphone.";
      case "NotFoundError":
        return "Aucun micro détecté sur cet appareil.";
      case "NotReadableError":
        return "Le micro est déjà utilisé par une autre application (Teams, Zoom…) ou bloqué par le système.";
      case "OverconstrainedError":
        return "Le micro sélectionné n'est plus disponible. Choisissez-en un autre.";
    }
  }
  return err instanceof Error ? err.message : "Impossible de démarrer l'enregistrement.";
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
  const [warning, setWarning] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [secureContext, setSecureContext] = useState(true);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("salle");
  const [level, setLevel] = useState(0);
  const [tooQuiet, setTooQuiet] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksToStopRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const recordingRef = useRef(false);

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId !== "default"));
  }

  async function acquireWakeLock() {
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      // refusé (batterie faible…) : l'enregistrement continue, l'écran peut juste s'éteindre
    }
  }

  function cleanupMedia() {
    recordingRef.current = false;
    if (meterRef.current) clearInterval(meterRef.current);
    meterRef.current = null;
    tracksToStopRef.current.forEach((t) => t.stop());
    tracksToStopRef.current = [];
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setLevel(0);
  }

  useEffect(() => {
    setSecureContext(window.isSecureContext && Boolean(navigator.mediaDevices));
    setDeviceId(readStored(MIC_STORAGE_KEY) ?? "");
    const storedMode = readStored(MODE_STORAGE_KEY);
    if (storedMode === "salle" || storedMode === "proche") setCaptureMode(storedMode);
    refreshDevices().catch(() => {});

    const onDeviceChange = () => refreshDevices().catch(() => {});
    navigator.mediaDevices?.addEventListener("devicechange", onDeviceChange);

    // Le verrou d'écran saute quand l'onglet passe en arrière-plan : on le reprend au retour.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && recordingRef.current) acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", onDeviceChange);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupMedia();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startLevelMeter(stream: MediaStream, audioContext: AudioContext) {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let quietTicks = 0;

    meterRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      setLevel(Math.min(1, rms * 10));
      quietTicks = rms < QUIET_RMS ? quietTicks + 1 : 0;
      setTooQuiet(quietTicks >= QUIET_ALERT_SECONDS * 10);
    }, 100);
  }

  async function startRecording() {
    setError(null);
    setWarning(null);
    setTooQuiet(false);
    setState("requesting");
    try {
      let stream: MediaStream;
      let audioContext: AudioContext;

      if (meeting.type === "presentiel") {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints(deviceId, captureMode),
        });
        tracksToStopRef.current = micStream.getTracks();
        audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        await audioContext.resume();
        stream = micStream;
      } else {
        // Visio : son partagé (onglet, fenêtre Teams/Zoom ou tout l'écran) + micro, mixés
        // pour garder les deux côtés de la conversation.
        let displayAudioTracks: MediaStreamTrack[] = [];
        if (!navigator.mediaDevices.getDisplayMedia) {
          setWarning(
            "Le partage d'écran n'est pas disponible sur cet appareil (téléphone) : seul le micro est enregistré."
          );
        } else {
          let displayStream: MediaStream;
          try {
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            });
          } catch (err) {
            if (err instanceof DOMException && err.name === "NotAllowedError") {
              throw new Error("Partage d'écran annulé.");
            }
            throw err;
          }
          displayAudioTracks = displayStream.getAudioTracks();
          displayStream.getVideoTracks().forEach((t) => t.stop());
          if (displayAudioTracks.length === 0) {
            setWarning(
              "Aucun audio système détecté : seul votre micro est enregistré. Relancez en cochant « Partager l'audio du système »."
            );
          }
        }

        let micStream: MediaStream | null = null;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: micConstraints(deviceId, "visio"),
          });
        } catch (err) {
          if (displayAudioTracks.length === 0) throw err;
          setWarning("Micro indisponible : seul le son de la visio est enregistré (pas votre voix).");
        }

        tracksToStopRef.current = [...displayAudioTracks, ...(micStream?.getTracks() ?? [])];
        audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        await audioContext.resume();

        const destination = audioContext.createMediaStreamDestination();
        if (displayAudioTracks.length > 0) {
          audioContext
            .createMediaStreamSource(new MediaStream(displayAudioTracks))
            .connect(destination);
        }
        if (micStream) audioContext.createMediaStreamSource(micStream).connect(destination);
        stream = destination.stream;
      }

      // Les libellés des micros ne sont visibles qu'une fois l'autorisation accordée.
      refreshDevices().catch(() => {});
      startLevelMeter(stream, audioContext);
      recordingRef.current = true;
      acquireWakeLock();

      chunksRef.current = [];
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 96000,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        cleanupMedia();
        onRecordingComplete?.(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setSeconds(0);
      setState("recording");
      updateMeeting(meeting.id, { status: "enregistrement_en_cours" });

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      cleanupMedia();
      if (err instanceof DOMException && err.name === "OverconstrainedError") {
        setDeviceId("");
        writeStored(MIC_STORAGE_KEY, "");
      }
      setState("error");
      setError(describeMicError(err));
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
            ? "Posez l'appareil à plat, au centre de la table, à égale distance des participants : c'est ce qui compte le plus pour distinguer les voix."
            : "Partagez la fenêtre de Teams/Zoom (ou tout l'écran) et cochez « Partager l'audio du système » — votre micro est capturé en parallèle pour garder les deux côtés de la conversation. Sur macOS, le son système n'est pas capturable par le navigateur : seul votre micro sera enregistré, sauf pilote audio virtuel (ex. BlackHole)."}
        </p>

        {!secureContext ? (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            L&apos;accès au micro exige une connexion sécurisée (adresse en https://). Ouvrez
            l&apos;application via son adresse HTTPS pour enregistrer.
          </p>
        ) : (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Micro</label>
              <select
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  writeStored(MIC_STORAGE_KEY, e.target.value);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Micro par défaut de l&apos;appareil</option>
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Micro ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
            {meeting.type === "presentiel" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Captation</label>
                <select
                  value={captureMode}
                  onChange={(e) => {
                    const mode = e.target.value as CaptureMode;
                    setCaptureMode(mode);
                    writeStored(MODE_STORAGE_KEY, mode);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="salle">Salle — plusieurs personnes (recommandé)</option>
                  <option value="proche">Voix proche — lieu bruyant</option>
                </select>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        <button
          onClick={startRecording}
          disabled={state === "requesting" || !secureContext}
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

        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Niveau du micro</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-200"
            role="meter"
            aria-label="Niveau du micro"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-100"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>
        </div>

        {tooQuiet && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            Le micro capte très peu de son depuis un moment. Rapprochez l&apos;appareil des
            intervenants ou vérifiez que le bon micro est sélectionné.
          </p>
        )}
        {warning && (
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            {warning}
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
