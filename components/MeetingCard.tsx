import Link from "next/link";
import { Users } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { MeetingStatusBadge, MeetingTypeBadge, STATUS_ACCENT } from "./StatusBadge";

function formatDate(date: string, time: string) {
  try {
    const d = new Date(`${date}T${time || "00:00"}`);
    return (
      d.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }) + (time ? ` · ${time}` : "")
    );
  } catch {
    return date;
  }
}

export default function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <Link
      href={`/reunions/${meeting.id}`}
      className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${STATUS_ACCENT[meeting.status]}`} />
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900 group-hover:text-brand-700">
          {meeting.title}
        </h3>
        <MeetingStatusBadge status={meeting.status} />
      </div>
      <p className="mb-4 text-sm text-slate-500">{formatDate(meeting.date, meeting.time)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <MeetingTypeBadge type={meeting.type} />
        {meeting.participants && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Users size={12} />
            {meeting.participants.split(",").length} participant(s)
          </span>
        )}
      </div>
    </Link>
  );
}
