import type { Meeting } from "@/lib/types";

const STATUS_LABELS: Record<Meeting["status"], { label: string; className: string }> = {
  planifiee: { label: "Planifiée", className: "bg-slate-100 text-slate-600" },
  enregistrement_en_cours: {
    label: "Enregistrement en cours",
    className: "bg-red-100 text-red-700",
  },
  enregistree: { label: "Enregistrée", className: "bg-amber-100 text-amber-700" },
  transcription_en_cours: {
    label: "Transcription en cours",
    className: "bg-blue-100 text-blue-700",
  },
  transcrite: { label: "Transcrite", className: "bg-emerald-100 text-emerald-700" },
};

export function MeetingStatusBadge({ status }: { status: Meeting["status"] }) {
  const { label, className } = STATUS_LABELS[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

const TYPE_LABELS: Record<Meeting["type"], { label: string; className: string }> = {
  visio: { label: "Visioconférence", className: "bg-indigo-100 text-indigo-700" },
  presentiel: { label: "Présentiel", className: "bg-teal-100 text-teal-700" },
};

export function MeetingTypeBadge({ type }: { type: Meeting["type"] }) {
  const { label, className } = TYPE_LABELS[type];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
