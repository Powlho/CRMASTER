"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Mic, MonitorUp, Square, TriangleAlert } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { useMeetings } from "@/lib/store";

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";
type UploadState = "idle" | "uploading" | "done" | "error";
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

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function localFileName(meeting: Meeting, blob: Blob) {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const base = meeting.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "reunion"}.${ext}`;
}

// XMLHttpRequest plutôt que fetch : seul lui donne la progression de l'envoi, utile pour
// un long enregistrement envoyé en 4G.
function uploadAudio(
  meetingId: string,
  blob: Blob,
  onProgress: (ratio: number) => void
): Promise<Meeting> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/meetings/${meetingId}/audio`);
    xhr.setRequestHeader("content-type", blob.type || "audio/webm");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { error?: string } & Partial<Meeting> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // réponse non JSON (session expirée → page de connexion, erreur Nginx…)
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.audio) {
        resolve(data as Meeting);
      } else if (xhr.status === 413) {
        reject(new Error("Fichier trop volumineux pour le serveur."));
      } else {
        reject(new Error(data.error || "Le serveur n'a pas accepté l'enregistrement. Reconnectez-vous puis réessayez."));
      }
    };
    xhr.onerror = () => reject(new Error("Connexion perdue pendant l'envoi."));
    xhr.send(blob);
  });
}

function SavedRecording({
  meeting,
  justSaved,
  onReplace,
}: {
  meeting: Meeting;
  justSaved: boolean;
  onReplace?: () => void;
}) {
  const src = `/api/meetings/${meeting.id}/audio`;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Enregistrement</h2>
      <p className="mb-4 text-sm text-slate-500">
        Durée : {formatDuration(meeting.recordingDurationSec ?? 0)}
        {meeting.audio && ` · ${formatSize(meeting.audio.sizeBytes)}`}
      </p>
      <audio controls preload="metadata" src={src} className="mb-4 w-full">
        Votre navigateur ne supporte pas la lecture audio.
      </audio>
      <div className="flex flex-wrap items-center gap-4">
        <a
          href={`${src}?download=1`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <Download size={15} />
          Télécharger l&apos;audio
        </a>
        {justSaved && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 size={14} />
            Sauvegardé sur le serveur
          </span>
        )}
        {onReplace && (
          <button
            onClick={onReplace}
            className="ml-auto text-xs text-slate-400 hover:text-slate-600 hover:underline"
          >
            Refaire l&apos;enregistrement
          </button>
        )}
      </div>
    </div>
  );
}

export default function RecorderPanel({ meeting }: { meeting: Meeting }) {
  const { updateMeeting, syncMeeting } = useMeetings();
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [secureContext, setSecureContext] = useState(true);
  const [replacing, setReplacing] = useState(false);

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
  const blobRef = useRef<Blob | null>(null);
  const secondsRef = useRef(0);

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
      // Quitter la page en cours d'enregistrement (lien interne) : on arrête proprement,
      // ce qui sauvegarde et envoie ce qui a été enregistré au lieu de le perdre.
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      } else {
        cleanupMedia();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fermeture ou rechargement de l'onglet pendant l'enregistrement ou l'envoi : le
  // navigateur demande confirmation.
  useEffect(() => {
    const unsaved = state === "recording" || uploadState === "uploading" || uploadState === "error";
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state, uploadState]);

  async function sendRecording() {
    const blob = blobRef.current;
    if (!blob) return;
    setUploadState("uploading");
    setUploadProgress(0);
    setUploadError(null);
    try {
      const saved = await uploadAudio(meeting.id, blob, setUploadProgress);
      syncMeeting(meeting.id, { audio: saved.audio });
      setUploadState("done");
    } catch (err) {
      setUploadState("error");
      setUploadError(err instanceof Error ? err.message : "Échec de l'envoi.");
    }
  }

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
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        cleanupMedia();
        setState("stopped");
        updateMeeting(meeting.id, {
          status: "enregistree",
          recordingDurationSec: secondsRef.current,
          transcriptionStatus: "en_attente_outil",
        });
        sendRecording();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setSeconds(0);
      secondsRef.current = 0;
      setState("recording");
      updateMeeting(meeting.id, { status: "enregistrement_en_cours" });

      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
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

  // La suite (sauvegarde, envoi au serveur) est gérée par recorder.onstop.
  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  if (state === "idle" && meeting.audio && !replacing) {
    return (
      <SavedRecording
        meeting={meeting}
        justSaved={false}
        onReplace={() => {
          if (
            window.confirm(
              "Un nouvel enregistrement remplacera l'audio actuel de cette réunion. Continuer ?"
            )
          ) {
            setReplacing(true);
          }
        }}
      />
    );
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
        <p className="mb-4 text-xs text-slate-500">
          Gardez cette page ouverte jusqu&apos;à la fin : l&apos;audio est envoyé au serveur dès
          l&apos;arrêt de l&apos;enregistrement.
        </p>
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

  if (uploadState === "done") {
    return <SavedRecording meeting={meeting} justSaved />;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Enregistrement terminé</h2>
      <p className="mb-4 text-sm text-slate-500">
        Durée : {formatDuration(meeting.recordingDurationSec ?? seconds)}
        {blobRef.current && ` · ${formatSize(blobRef.current.size)}`}
      </p>
      {audioUrl && (
        <audio controls src={audioUrl} className="mb-4 w-full">
          Votre navigateur ne supporte pas la lecture audio.
        </audio>
      )}

      {uploadState === "error" ? (
        <div>
          <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              {uploadError} L&apos;audio n&apos;est pas encore sauvegardé : ne quittez pas cette
              page sans l&apos;avoir envoyé ou téléchargé.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={sendRecording}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              Réessayer l&apos;envoi
            </button>
            {audioUrl && blobRef.current && (
              <a
                href={audioUrl}
                download={localFileName(meeting, blobRef.current)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
              >
                <Download size={15} />
                Télécharger une copie
              </a>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Envoi vers le serveur…</span>
            <span className="tabular-nums">{Math.round(uploadProgress * 100)} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
              style={{ width: `${Math.round(uploadProgress * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">Ne fermez pas cette page avant la fin.</p>
        </div>
      )}
    </div>
  );
}
