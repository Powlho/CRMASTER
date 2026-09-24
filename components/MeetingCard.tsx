import Link from "next/link";
import type { Meeting } from "@/lib/types";
import { MeetingStatusBadge, MeetingTypeBadge } from "./StatusBadge";

function formatDate(date: string, time: string) {
  try {
    const d = new Date(`${date}T${time || "00:00"}`);
    return d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }) + (time ? ` · ${time}` : "");
  } catch {
    return date;
  }
}

export default function MeetingCard({ meeting }: { meeting: Meeting }) {
  return (
    <Link
      href={`/reunions/${meeting.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">{meeting.title}</h3>
        <MeetingStatusBadge status={meeting.status} />
      </div>
      <p className="mb-4 text-sm text-slate-500">{formatDate(meeting.date, meeting.time)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <MeetingTypeBadge type={meeting.type} />
        {meeting.participants && (
          <span className="text-xs text-slate-400">
            {meeting.participants.split(",").length} participant(s)
          </span>
        )}
      </div>
    </Link>
  );
}
