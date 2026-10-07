"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMeetings } from "@/lib/store";
import MeetingForm from "@/components/MeetingForm";
import type { LibraryFile, Meeting, MeetingType, NewMeetingInput } from "@/lib/types";

// Préremplissage possible :
//   ?audio=<id>      depuis la Bibliothèque audio (le fichier devient l'audio de la réunion)
//   ?event=<id>&title=…&date=…&time=…&participants=…&notes=…&type=…   depuis l'Agenda
type SearchParams = Partial<
  Record<"audio" | "event" | "title" | "date" | "time" | "participants" | "notes" | "type", string>
>;

export default function NewMeetingPage({ searchParams }: { searchParams: SearchParams }) {
  const router = useRouter();
  const { createMeeting, updateMeeting, replaceMeeting } = useMeetings();
  const [libraryFile, setLibraryFile] = useState<LibraryFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioId = searchParams.audio;

  useEffect(() => {
    if (!audioId) return;
    fetch(`/api/library/${audioId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { file: LibraryFile } | null) => setLibraryFile(data?.file ?? null))
      .catch(() => {});
  }, [audioId]);

  // Le formulaire ne lit ses valeurs initiales qu'au premier affichage : on attend le titre
  // du fichier de la bibliothèque avant de l'afficher.
  if (audioId && !libraryFile) {
    return <p className="text-sm text-slate-400">Chargement…</p>;
  }

  const initial: Partial<NewMeetingInput> = {
    title: searchParams.title ?? libraryFile?.title,
    date: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date : undefined,
    time: /^\d{2}:\d{2}$/.test(searchParams.time ?? "") ? searchParams.time : undefined,
    participants: searchParams.participants,
    notes: searchParams.notes,
    type: (["visio", "presentiel"] as MeetingType[]).includes(searchParams.type as MeetingType)
      ? (searchParams.type as MeetingType)
      : undefined,
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Nouvelle réunion</h1>
      <p className="mb-8 text-sm text-slate-500">
        Renseignez les informations de la réunion. Vous pourrez lancer l&apos;enregistrement
        (ou importer un fichier audio) depuis sa page dédiée.
      </p>
      {libraryFile && (
        <p className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Compte rendu à partir de l&apos;audio <strong>{libraryFile.title}</strong> : il sera
          rattaché à la réunion, prêt à être transcrit.
        </p>
      )}
      {searchParams.event && (
        <p className="mb-6 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Informations reprises de votre agenda Google : vérifiez-les puis créez la réunion.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <MeetingForm
        initial={initial}
        submitLabel="Créer la réunion"
        submitting={submitting}
        onCancel={() => router.back()}
        onSubmit={async (input) => {
          setSubmitting(true);
          setError(null);
          try {
            const meeting = await createMeeting(input);
            if (searchParams.event) {
              updateMeeting(meeting.id, { googleEventId: searchParams.event });
            }
            if (libraryFile) {
              const res = await fetch(`/api/meetings/${meeting.id}/audio/from-library`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ libraryId: libraryFile.id }),
              });
              if (res.ok) replaceMeeting((await res.json()) as Meeting);
            }
            router.push(`/reunions/${meeting.id}`);
          } catch {
            setError("Impossible de créer la réunion.");
            setSubmitting(false);
          }
        }}
      />
    </div>
  );
}
