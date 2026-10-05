"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CloudOff,
  Download,
  History,
  Mic,
  MonitorUp,
  Square,
  TriangleAlert,
  Upload,
} from "lucide-react";
import type { Meeting } from "@/lib/types";
import { useMeetings } from "@/lib/store";
import { AUDIO_EXTENSIONS, IMPORT_ACCEPT, audioTypeOfFile } from "@/lib/audioTypes";
import { fileBaseName } from "@/lib/meetingText";
import { LiveUpload, getActiveUpload, type LiveUploadState } from "@/lib/liveUpload";
import { MAX_IMPORT_BYTES, probeDuration, uploadFile } from "@/lib/audioUpload";
import {
  deleteBackup,
  findBackups,
  pruneOldBackups,
  type Backup,
} from "@/lib/recordingBackup";

type RecorderState = "idle" | "requesting" | "recording" | "stopped" | "error";
type ImportState = { phase: "uploading" | "error"; progress: number; error: string | null };
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


function downloadName(meeting: Meeting, mimeType: string) {
  const type = mimeType.split(";")[0];
  return `${fileBaseName(meeting)}.${AUDIO_EXTENSIONS[type] ?? "webm"}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums">{pct} %</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
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
        Durée :{" "}
        {meeting.recordingDurationSec != null ? formatDuration(meeting.recordingDurationSec) : "—"}
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
            Refaire l&apos;enregistrement ou importer un fichier
          </button>
        )}
      </div>
    </div>
  );
}

export default function RecorderPanel({ meeting }: { meeting: Meeting }) {
  const { updateMeeting, syncMeeting, replaceMeeting } = useMeetings();
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [secureContext, setSecureContext] = useState(true);
  const [replacing, setReplacing] = useState(false);

  // Envoi en direct de l'enregistrement en cours (ou qui vient de se terminer).
  const [upload, setUpload] = useState<LiveUpload | null>(null);
  const [uploadSnap, setUploadSnap] = useState<LiveUploadState | null>(null);
  // Import d'un fichier audio existant.
  const [importState, setImportState] = useState<ImportState | null>(null);
  // Enregistrements interrompus : copie restée sur l'appareil, ou reçue par le serveur.
  const [backups, setBackups] = useState<Backup[]>([]);
  const [serverPartBytes, setServerPartBytes] = useState<{ session: string; size: number } | null>(
    null
  );
  const [recovering, setRecovering] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("salle");
  const [level, setLevel] = useState(0);
  const [tooQuiet, setTooQuiet] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const tracksToStopRef = useRef<MediaStreamTrack[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const recordingRef = useRef(false);
  const secondsRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function refreshRecoverable(activeSession?: string) {
    const local = (await findBackups(meeting.id)).filter((b) => b.session !== activeSession);
    setBackups(local);
    // Sans copie locale, le serveur a peut-être reçu une partie d'un enregistrement coupé
    // (téléphone éteint en pleine réunion, enregistrement lancé sur un autre appareil…).
    if (local.length === 0 && meeting.status === "enregistrement_en_cours" && !activeSession) {
      try {
        const res = await fetch(`/api/meetings/${meeting.id}/audio/live`);
        const data = (await res.json()) as { parts?: { session: string; size: number }[] };
        setServerPartBytes(data.parts?.[0] ?? null);
      } catch {
        // rien à proposer
      }
    }
  }

  useEffect(() => {
    setSecureContext(window.isSecureContext && Boolean(navigator.mediaDevices));
    setDeviceId(readStored(MIC_STORAGE_KEY) ?? "");
    const storedMode = readStored(MODE_STORAGE_KEY);
    if (storedMode === "salle" || storedMode === "proche") setCaptureMode(storedMode);
    refreshDevices().catch(() => {});

    // Envoi encore en cours d'un enregistrement fait avant de quitter puis revenir sur la page.
    const running = getActiveUpload(meeting.id);
    if (running) {
      setUpload(running);
      setState("stopped");
      setAudioUrl(URL.createObjectURL(running.blob));
    }
    pruneOldBackups().finally(() => refreshRecoverable(running?.session));

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
      // ce qui envoie la fin au serveur au lieu de la perdre.
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      } else {
        cleanupMedia();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!upload) {
      setUploadSnap(null);
      return;
    }
    setUploadSnap(upload.snapshot);
    return upload.subscribe(setUploadSnap);
  }, [upload]);

  // Fermeture ou rechargement de l'onglet pendant l'enregistrement ou un envoi : le
  // navigateur demande confirmation.
  const unsaved =
    state === "recording" ||
    uploadSnap?.phase === "finishing" ||
    uploadSnap?.phase === "error" ||
    importState?.phase === "uploading";
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

  // Le composant peut avoir été quitté entre-temps : la mise à jour passe par le magasin
  // global des réunions, qui survit à la navigation.
  function finishUpload(target: LiveUpload, durationSec?: number) {
    target
      .finish(durationSec)
      .then((saved) => {
        replaceMeeting(saved);
        setReplacing(false);
      })
      .catch(() => {
        // l'erreur est affichée via l'état de l'envoi
      });
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

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 96000,
      });
      const live = LiveUpload.start(meeting.id, recorder.mimeType || mimeType || "audio/webm");
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) live.push(e.data, secondsRef.current);
      };
      recorder.onstop = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        cleanupMedia();
        setAudioUrl(URL.createObjectURL(live.blob));
        setState("stopped");
        // Affichage immédiat ; le serveur confirme quand l'envoi est terminé.
        syncMeeting(meeting.id, {
          status: "enregistree",
          recordingDurationSec: secondsRef.current,
        });
        finishUpload(live, secondsRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setUpload(live);
      setSeconds(0);
      secondsRef.current = 0;
      setState("recording");
      setServerPartBytes(null);
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

  // La suite (envoi de la fin au serveur) est gérée par recorder.onstop.
  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function handleImport(file: File) {
    const type = audioTypeOfFile(file);
    if (!type) {
      setImportState({
        phase: "error",
        progress: 0,
        error: "Format non reconnu. Formats acceptés : mp3, m4a, wav, webm, ogg, aac, flac, mp4.",
      });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setImportState({
        phase: "error",
        progress: 0,
        error: "Fichier trop volumineux (500 Mo maximum).",
      });
      return;
    }
    setImportState({ phase: "uploading", progress: 0, error: null });
    const durationSec = await probeDuration(file);
    try {
      const saved = await uploadFile(meeting.id, file, type, durationSec, (progress) =>
        setImportState({ phase: "uploading", progress, error: null })
      );
      replaceMeeting(saved);
      setImportState(null);
      setReplacing(false);
    } catch (err) {
      setImportState({
        phase: "error",
        progress: 0,
        error: err instanceof Error ? err.message : "Échec de l'envoi.",
      });
    }
  }

  async function recoverLocal(backup: Backup) {
    setRecovering(true);
    try {
      const resumed = await LiveUpload.resume(backup);
      setBackups((prev) => prev.filter((b) => b.session !== backup.session));
      setUpload(resumed);
      setAudioUrl(URL.createObjectURL(resumed.blob));
      setState("stopped");
      finishUpload(resumed);
    } finally {
      setRecovering(false);
    }
  }

  async function discardLocal(backup: Backup) {
    if (!window.confirm("Supprimer définitivement cette copie de l'enregistrement ?")) return;
    await deleteBackup(backup.session);
    setBackups((prev) => prev.filter((b) => b.session !== backup.session));
  }

  async function recoverServer() {
    if (!serverPartBytes) return;
    setRecovering(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/meetings/${meeting.id}/audio/live?session=${serverPartBytes.session}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.audio) throw new Error(data.error || "Récupération impossible.");
      replaceMeeting(data as Meeting);
      setServerPartBytes(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Récupération impossible.");
    } finally {
      setRecovering(false);
    }
  }

  function ignoreServerPart() {
    setServerPartBytes(null);
    updateMeeting(meeting.id, { status: meeting.audio ? "enregistree" : "planifiee" });
  }

  // ——— Affichage ———

  if (state === "recording") {
    const behind = uploadSnap ? uploadSnap.totalBytes - uploadSnap.sentBytes : 0;
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

        {uploadSnap && (
          <p
            className={`mb-4 flex items-start gap-2 text-xs ${
              uploadSnap.online ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {uploadSnap.online ? (
              <>
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                Sauvegarde en direct sur le serveur · {formatSize(uploadSnap.sentBytes)} envoyés
              </>
            ) : (
              <>
                <CloudOff size={14} className="mt-0.5 shrink-0" />
                Serveur injoignable : l&apos;enregistrement continue et une copie est gardée sur
                cet appareil ({formatSize(behind)} en attente). L&apos;envoi reprendra tout seul.
              </>
            )}
          </p>
        )}

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

  // Fin d'un enregistrement : envoi du reste puis confirmation du serveur.
  if (upload && uploadSnap && uploadSnap.phase !== "done") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Enregistrement terminé</h2>
        <p className="mb-4 text-sm text-slate-500">
          {meeting.recordingDurationSec != null &&
            `Durée : ${formatDuration(meeting.recordingDurationSec)} · `}
          {formatSize(uploadSnap.totalBytes)}
        </p>
        {audioUrl && (
          <audio controls src={audioUrl} className="mb-4 w-full">
            Votre navigateur ne supporte pas la lecture audio.
          </audio>
        )}

        {uploadSnap.phase === "error" ? (
          <div>
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                {uploadSnap.error} L&apos;audio n&apos;est pas encore sur le serveur, mais une
                copie est gardée sur cet appareil : vous pourrez le récupérer en revenant sur
                cette réunion.
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => finishUpload(upload)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                Réessayer l&apos;envoi
              </button>
              {audioUrl && (
                <a
                  href={audioUrl}
                  download={downloadName(meeting, upload.mimeType)}
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
            <ProgressBar
              ratio={uploadSnap.totalBytes ? uploadSnap.sentBytes / uploadSnap.totalBytes : 0}
              label={uploadSnap.online ? "Envoi de la fin de l'enregistrement…" : "Serveur injoignable, nouvel essai…"}
            />
            <p className="mt-2 text-xs text-slate-400">
              Restez sur cette page jusqu&apos;à la fin de l&apos;envoi.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (importState?.phase === "uploading") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Import du fichier audio</h2>
        <ProgressBar ratio={importState.progress} label="Envoi vers le serveur…" />
        <p className="mt-2 text-xs text-slate-400">Ne fermez pas cette page avant la fin.</p>
      </div>
    );
  }

  if (meeting.audio && !replacing && state !== "requesting" && state !== "error") {
    return (
      <SavedRecording
        meeting={meeting}
        justSaved={uploadSnap?.phase === "done"}
        onReplace={() => {
          if (
            window.confirm(
              "Un nouvel enregistrement ou un fichier importé remplacera l'audio actuel, ainsi que sa transcription et son compte rendu. Continuer ?"
            )
          ) {
            setReplacing(true);
          }
        }}
      />
    );
  }

  const busy = state === "requesting" || recovering;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          {meeting.type === "presentiel" ? <Mic size={18} /> : <MonitorUp size={18} />}
        </div>
        <h2 className="text-base font-semibold text-slate-900">Enregistrement</h2>
        {replacing && (
          <button
            onClick={() => setReplacing(false)}
            className="ml-auto text-xs text-slate-400 hover:text-slate-600 hover:underline"
          >
            Annuler
          </button>
        )}
      </div>

      {backups.map((b) => (
        <div key={b.session} className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 flex items-start gap-2 text-sm text-amber-800">
            <History size={16} className="mt-0.5 shrink-0" />
            <span>
              Un enregistrement interrompu ({formatDuration(b.durationSec)} ·{" "}
              {formatSize(b.sizeBytes)}, le{" "}
              {new Date(b.updatedAt).toLocaleString("fr-FR", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
              ) est conservé sur cet appareil mais n&apos;a pas été entièrement envoyé.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => recoverLocal(b)}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Récupérer et envoyer
            </button>
            <button
              onClick={() =>
                saveBlob(new Blob(b.chunks, { type: b.mimeType }), downloadName(meeting, b.mimeType))
              }
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Télécharger
            </button>
            <button
              onClick={() => discardLocal(b)}
              className="text-xs text-slate-500 hover:text-red-600 hover:underline"
            >
              Supprimer la copie
            </button>
          </div>
        </div>
      ))}

      {serverPartBytes && backups.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 flex items-start gap-2 text-sm text-amber-800">
            <History size={16} className="mt-0.5 shrink-0" />
            <span>
              L&apos;enregistrement de cette réunion a été interrompu. Le serveur en a reçu{" "}
              {formatSize(serverPartBytes.size)} : vous pouvez récupérer cette partie.
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={recoverServer}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Récupérer
            </button>
            <button
              onClick={ignoreServerPart}
              className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}

      {meeting.audioDeletedAt && !meeting.audio && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          L&apos;audio de cette réunion a été supprimé automatiquement le{" "}
          {new Date(meeting.audioDeletedAt).toLocaleDateString("fr-FR")} (durée de conservation
          dépassée). La transcription et le compte rendu sont conservés.
        </p>
      )}

      <p className="mb-4 text-sm text-slate-500">
        {meeting.type === "presentiel"
          ? "Posez l'appareil à plat, au centre de la table, à égale distance des participants : c'est ce qui compte le plus pour distinguer les voix."
          : "Partagez la fenêtre de Teams/Zoom (ou tout l'écran) et cochez « Partager l'audio du système » — votre micro est capturé en parallèle pour garder les deux côtés de la conversation. Sur macOS, le son système n'est pas capturable par le navigateur : seul votre micro sera enregistré, sauf pilote audio virtuel (ex. BlackHole)."}
      </p>

      {!secureContext ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          L&apos;accès au micro exige une connexion sécurisée (adresse en https://). Ouvrez
          l&apos;application via son adresse HTTPS pour enregistrer — l&apos;import de fichier
          fonctionne en attendant.
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
      {importState?.phase === "error" && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {importState.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={startRecording}
          disabled={busy || !secureContext}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
          {state === "requesting" ? "Autorisation en cours…" : "Démarrer l'enregistrement"}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <Upload size={15} />
          Importer un fichier audio
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleImport(file);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Import : enregistrement Teams/Zoom (mp4), mémo vocal, dictaphone… (mp3, m4a, wav, ogg,
        webm, aac, flac — 500 Mo max).
      </p>
    </div>
  );
}
