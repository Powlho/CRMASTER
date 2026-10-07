"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileAudio, TriangleAlert } from "lucide-react";
import { useMeetings } from "@/lib/store";
import type { NewMeetingInput } from "@/lib/types";
import { audioTypeOfFile } from "@/lib/audioTypes";
import { MAX_IMPORT_BYTES, MAX_IMPORT_LABEL, probeDuration, uploadFile } from "@/lib/audioUpload";
import { deleteSharedFile, listSharedFiles, type SharedFile } from "@/lib/sharedFiles";
import MeetingForm from "@/components/MeetingForm";

const SHARE_ERRORS: Record<string, string> = {
  vide: "Aucun fichier audio n'a été reçu. Dans l'Enregistreur, choisissez Partager → Fichier audio.",
  lecture: "Le fichier partagé n'a pas pu être lu. Réessayez le partage.",
  sw: "L'application n'était pas prête à recevoir le fichier. Ouvrez CRMASTER une fois, puis réessayez le partage.",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Titre, date et heure proposés à partir du fichier : l'heure de modification du fichier
// correspond à la fin de l'enregistrement, on en retire la durée pour retrouver le début.
function suggestedInput(file: SharedFile, durationSec: number | null): Partial<NewMeetingInput> {
  const start = new Date(file.lastModified - (durationSec ?? 0) * 1000);
  const fromName = file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return {
    title: file.title.trim() || fromName || "Réunion",
    type: "presentiel",
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    notes: file.text.trim(),
  };
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h} h ${pad(m)}` : `${m} min ${pad(s)}`;
}

// useSearchParams exige une frontière Suspense pour le rendu côté serveur.
export default function SharePageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Chargement…</p>}>
      <SharePage />
    </Suspense>
  );
}

function SharePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createMeeting, replaceMeeting } = useMeetings();
  const [files, setFiles] = useState<SharedFile[] | null>(null);
  const [duration, setDuration] = useState<number | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Réunion déjà créée lors d'un essai qui a échoué : on ne la recrée pas en réessayant.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const current = files?.[0] ?? null;
  const type = current ? audioTypeOfFile({ name: current.name, type: current.type }) : null;
  const shareError = SHARE_ERRORS[searchParams.get("erreur") ?? ""];

  useEffect(() => {
    listSharedFiles().then(setFiles);
  }, []);

  useEffect(() => {
    if (!current) return;
    setDuration(undefined);
    probeDuration(current.blob).then(setDuration);
  }, [current]);

  async function next() {
    if (current) await deleteSharedFile(current.id);
    setFiles((prev) => prev?.slice(1) ?? null);
    setCreatedId(null);
    setError(null);
  }

  async function handleSubmit(input: NewMeetingInput) {
    if (!current || !type) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const meetingId = createdId ?? (await createMeeting(input)).id;
      setCreatedId(meetingId);
      const saved = await uploadFile(meetingId, current.blob, type, duration ?? null, setProgress);
      replaceMeeting(saved);
      await deleteSharedFile(current.id);
      // La transcription démarre d'elle-même à l'ouverture de la réunion.
      router.replace(`/reunions/${meetingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi.");
      setUploading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Enregistrement partagé
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Vérifiez les informations de la réunion : l&apos;audio y sera rattaché, prêt à être
        transcrit.
      </p>

      {shareError && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {shareError}
        </p>
      )}

      {files === null ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : !current ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <p className="mb-2">Aucun enregistrement en attente.</p>
          <p className="text-xs text-slate-400">
            Depuis l&apos;Enregistreur Google : ouvrez l&apos;enregistrement, Partager →
            Fichier audio → CRMASTER.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
              <FileAudio size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {current.name || "Fichier audio"}
              </p>
              <p className="text-xs text-slate-500">
                {formatSize(current.blob.size)}
                {duration ? ` · ${formatDuration(duration)}` : ""}
                {files.length > 1 && ` · ${files.length - 1} autre(s) fichier(s) en attente`}
              </p>
            </div>
            <button
              onClick={next}
              disabled={uploading}
              className="shrink-0 text-xs text-slate-400 hover:text-red-600 hover:underline disabled:opacity-50"
            >
              Ignorer
            </button>
          </div>

          {!type ? (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              Ce fichier n&apos;est pas un format audio reconnu (mp3, m4a, wav, webm, ogg, aac,
              flac, mp4).
            </p>
          ) : current.blob.size > MAX_IMPORT_BYTES ? (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              Fichier trop volumineux ({MAX_IMPORT_LABEL} maximum).
            </p>
          ) : duration === undefined ? (
            <p className="text-sm text-slate-400">Lecture du fichier…</p>
          ) : (
            <>
              {uploading && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Envoi vers le serveur…</span>
                    <span className="tabular-nums">{Math.round(progress * 100)} %</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {error && (
                <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  {error} Le fichier reste disponible ici : vous pouvez réessayer.
                </p>
              )}
              <MeetingForm
                key={current.id}
                initial={suggestedInput(current, duration)}
                submitLabel={createdId ? "Réessayer l'envoi" : "Créer la réunion et envoyer l'audio"}
                submitting={uploading}
                onCancel={() => router.push("/")}
                onSubmit={handleSubmit}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
