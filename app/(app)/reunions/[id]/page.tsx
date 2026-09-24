"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useMeetings } from "@/lib/store";
import { MeetingStatusBadge, MeetingTypeBadge } from "@/components/StatusBadge";
import RecorderPanel from "@/components/RecorderPanel";
import TranscriptionPanel from "@/components/TranscriptionPanel";
import { getTranscriptionProfile } from "@/lib/transcriptionProfiles";

export default function MeetingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { getMeeting, updateMeeting, deleteMeeting, ready } = useMeetings();
  const meeting = getMeeting(params.id);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  if (!ready) {
    return <p className="text-sm text-slate-400">Chargement…</p>;
  }

  if (!meeting) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="mb-4 text-slate-500">Réunion introuvable.</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Retour aux réunions
        </button>
      </div>
    );
  }

  function handleDelete() {
    if (!meeting) return;
    if (confirm("Supprimer cette réunion ?")) {
      deleteMeeting(meeting.id);
      router.push("/");
    }
  }

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => router.push("/")}
        className="mb-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={15} />
        Toutes les réunions
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{meeting.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(`${meeting.date}T${meeting.time || "00:00"}`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            à {meeting.time}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MeetingTypeBadge type={meeting.type} />
            <MeetingStatusBadge status={meeting.status} />
            {meeting.transcriptionProfile && meeting.transcriptionProfile !== "none" && (
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                {getTranscriptionProfile(meeting.transcriptionProfile).label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-600"
        >
          <Trash2 size={15} />
          Supprimer
        </button>
      </div>

      {(meeting.participants || meeting.notes) && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {meeting.participants && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Participants
              </p>
              <p className="mt-1 text-sm text-slate-700">{meeting.participants}</p>
            </div>
          )}
          {meeting.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{meeting.notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-6">
        <RecorderPanel meeting={meeting} onRecordingComplete={setAudioBlob} />
        <TranscriptionPanel
          meeting={meeting}
          audioBlob={audioBlob}
          onUpdate={(patch) => updateMeeting(meeting.id, patch)}
        />
      </div>
    </div>
  );
}
