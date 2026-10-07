"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  CheckCircle2,
  Download,
  FilePlus2,
  Link2,
  Loader2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { AudioDownloadJob, AudioFile } from "@/lib/types";

function formatDuration(totalSeconds: number | null) {
  if (totalSeconds == null) return null;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AudioLibraryPage() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<AudioDownloadJob[]>([]);
  const [files, setFiles] = useState<AudioFile[] | null>(null);

  const refreshFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/audio");
      const data = await res.json();
      if (res.ok) setFiles(data.files);
    } catch {
      setFiles((f) => f ?? []);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/jobs");
      const data = await res.json();
      if (res.ok) setJobs(data.jobs);
    } catch {
      // Réessai au prochain tick.
    }
  }, []);

  useEffect(() => {
    refreshFiles();
    refreshJobs();
  }, [refreshFiles, refreshJobs]);

  const hasRunningJob = jobs.some((j) => j.status === "running");

  // Sondage de la progression tant qu'un téléchargement est en cours.
  useEffect(() => {
    if (!hasRunningJob) return;
    const interval = setInterval(async () => {
      await refreshJobs();
    }, 1500);
    return () => clearInterval(interval);
  }, [hasRunningJob, refreshJobs]);

  // Un téléchargement vient de se terminer : on recharge la bibliothèque.
  const doneCount = jobs.filter((j) => j.status === "done").length;
  useEffect(() => {
    if (doneCount > 0) refreshFiles();
  }, [doneCount, refreshFiles]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/audio/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de lancer le téléchargement.");
        return;
      }
      setUrl("");
      await refreshJobs();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setSubmitting(false);
    }
  }

  async function dismissJob(id: string) {
    await fetch(`/api/audio/jobs?id=${id}`, { method: "DELETE" }).catch(() => {});
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  async function deleteFile(file: AudioFile) {
    if (!confirm(`Supprimer « ${file.title} » du serveur ?`)) return;
    const res = await fetch(`/api/audio/${file.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setFiles((prev) => prev?.filter((f) => f.id !== file.id) ?? null);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Bibliothèque audio</h1>
      <p className="mb-8 text-sm text-slate-500">
        Récupérez la piste audio d&apos;une vidéo (YouTube, Vimeo, Dailymotion, Twitch, X,
        LinkedIn… via{" "}
        <a
          href="https://github.com/yt-dlp/yt-dlp"
          target="_blank"
          rel="noreferrer"
          className="text-brand-600 hover:underline"
        >
          yt-dlp
        </a>
        ). Les fichiers sont stockés sur le serveur et utilisables pour un compte rendu.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="mb-2 block text-sm font-medium text-slate-700">Lien de la vidéo</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Télécharger l&apos;audio
          </button>
        </div>
        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {jobs.length > 0 && (
          <ul className="mt-4 space-y-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  {job.status === "running" ? (
                    <Loader2 size={15} className="shrink-0 animate-spin text-brand-500" />
                  ) : job.status === "done" ? (
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
                  ) : (
                    <TriangleAlert size={15} className="shrink-0 text-red-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {job.title ?? job.url}
                  </span>
                  {job.status === "running" ? (
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {job.progress.toFixed(0)} %
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => dismissJob(job.id)}
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Masquer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                {job.status === "running" && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all"
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                )}
                {job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
            <AudioLines size={18} />
          </div>
          <h2 className="text-base font-semibold text-slate-900">Fichiers sur le serveur</h2>
        </div>

        {files === null ? (
          <p className="text-sm text-slate-400">Chargement…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun fichier pour l&apos;instant. Collez un lien ci-dessus pour récupérer un audio.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {files.map((file) => (
              <li key={file.id} className="py-4 first:pt-0 last:pb-0">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{file.title}</p>
                    <p className="text-xs text-slate-500">
                      {[
                        file.platform ?? (file.source === "upload" ? "Import" : null),
                        formatDuration(file.durationSec),
                        formatSize(file.sizeBytes),
                        new Date(file.createdAt).toLocaleDateString("fr-FR"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {file.sourceUrl && (
                        <>
                          {" · "}
                          <a
                            href={file.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 hover:underline"
                          >
                            source
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/reunions/nouvelle?audio=${file.id}`}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                    >
                      <FilePlus2 size={13} />
                      Compte rendu
                    </Link>
                    <a
                      href={`/api/audio/${file.id}/file?download=1`}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Télécharger sur cet appareil"
                    >
                      <Download size={15} />
                    </a>
                    <button
                      onClick={() => deleteFile(file)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Supprimer du serveur"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <audio
                  controls
                  preload="none"
                  src={`/api/audio/${file.id}/file`}
                  className="h-9 w-full"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
