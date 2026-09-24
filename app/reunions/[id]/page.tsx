"use client";

import { useRouter } from "next/navigation";
import { useMeetings } from "@/lib/store";
import { MeetingStatusBadge, MeetingTypeBadge } from "@/components/StatusBadge";
import RecorderPanel from "@/components/RecorderPanel";
import TranscriptionPanel from "@/components/TranscriptionPanel";

export default function MeetingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { getMeeting, deleteMeeting, ready } = useMeetings();
  const meeting = getMeeting(params.id);

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
        className="mb-6 text-sm text-slate-500 hover:text-slate-700"
      >
        ← Toutes les réunions
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{meeting.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(`${meeting.date}T${meeting.time || "00:00"}`).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            à {meeting.time}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <MeetingTypeBadge type={meeting.type} />
            <MeetingStatusBadge status={meeting.status} />
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="text-sm text-slate-400 hover:text-red-600"
        >
          Supprimer
        </button>
      </div>

      {(meeting.participants || meeting.notes) && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
        <RecorderPanel meeting={meeting} />
        <TranscriptionPanel meeting={meeting} />
      </div>
    </div>
  );
}
