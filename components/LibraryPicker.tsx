"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AudioLines, Loader2 } from "lucide-react";
import type { LibraryFile, Meeting } from "@/lib/types";
import { useMeetings } from "@/lib/store";

// Utiliser comme audio de la réunion une piste de la bibliothèque (vidéo YouTube, etc.).
export default function LibraryPicker({ meeting }: { meeting: Meeting }) {
  const { replaceMeeting } = useMeetings();
  const [files, setFiles] = useState<LibraryFile[] | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((data: { files: LibraryFile[] }) => setFiles(data.files))
      .catch(() => setFiles([]));
  }, []);

  async function use() {
    if (!selected) return;
    if (
      meeting.audio &&
      !window.confirm(
        "Remplacer l'audio de cette réunion ? La transcription et le compte rendu actuels seront effacés."
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/audio/from-library`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ libraryId: selected }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.audio) {
        setError(data?.error || "Impossible d'utiliser ce fichier.");
        return;
      }
      replaceMeeting(data as Meeting);
      setSelected("");
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setBusy(false);
    }
  }

  if (!files || meeting.status === "enregistrement_en_cours") return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
      <div className="flex items-center gap-2">
        <AudioLines size={16} className="text-slate-400" />
        <p className="text-sm font-medium text-slate-800">Audio de la bibliothèque</p>
      </div>
      {files.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          Pour transcrire une vidéo (YouTube…), récupérez d&apos;abord son audio dans la{" "}
          <Link href="/audio" className="text-brand-600 hover:underline">
            Bibliothèque audio
          </Link>
          .
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">— Choisir un fichier —</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={use}
            disabled={!selected || busy}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Utiliser pour cette réunion
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
