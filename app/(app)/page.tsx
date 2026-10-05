"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Clock, Plus, Search, Sparkles, X } from "lucide-react";
import { useMeetings } from "@/lib/store";
import { searchMeetings } from "@/lib/search";
import MeetingCard from "@/components/MeetingCard";

export default function DashboardPage() {
  const { meetings, ready } = useMeetings();
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchMeetings(meetings, query), [meetings, query]);
  const searching = query.trim().length > 0;

  const upcoming = meetings.filter((m) => m.status === "planifiee");
  const inProgress = meetings.filter(
    (m) => m.status === "enregistrement_en_cours"
  );
  const past = meetings.filter(
    (m) =>
      m.status === "enregistree" ||
      m.status === "transcription_en_cours" ||
      m.status === "transcrite"
  );
  const transcribed = meetings.filter((m) => m.transcriptionStatus === "terminee").length;
  const totalMinutes = Math.round(
    meetings.reduce((sum, m) => sum + (m.recordingDurationSec ?? 0), 0) / 60
  );

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Réunions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Créez vos réunions, lancez l&apos;enregistrement et suivez la transcription.
          </p>
        </div>
        <Link
          href="/reunions/nouvelle"
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Nouvelle réunion
        </Link>
      </div>

      {ready && meetings.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={CalendarClock} label="Réunions" value={meetings.length} />
          <StatCard icon={Clock} label="Minutes enregistrées" value={totalMinutes} />
          <StatCard icon={Sparkles} label="Transcrites" value={transcribed} />
        </div>
      )}

      {ready && meetings.length > 0 && (
        <div className="relative mb-8">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            inputMode="search"
            aria-label="Rechercher"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les titres, participants, comptes rendus et transcriptions…"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {searching && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {!ready ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : searching ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {hits.length === 0
              ? "Aucun résultat"
              : `${hits.length} résultat${hits.length > 1 ? "s" : ""}`}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hits.map((hit) => (
              <MeetingCard key={hit.meeting.id} meeting={hit.meeting} snippet={hit.snippet} />
            ))}
          </div>
        </section>
      ) : meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-white">
            <CalendarClock size={22} />
          </div>
          <p className="mb-4 text-slate-500">
            Aucune réunion pour le moment. Créez-en une pour commencer à enregistrer.
          </p>
          <Link
            href="/reunions/nouvelle"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={16} />
            Créer une réunion
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {inProgress.length > 0 && (
            <Section title="En cours d'enregistrement" meetings={inProgress} />
          )}
          {upcoming.length > 0 && <Section title="À venir" meetings={upcoming} />}
          {past.length > 0 && <Section title="Passées" meetings={past} />}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xl font-bold leading-tight text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function Section({
  title,
  meetings,
}: {
  title: string;
  meetings: ReturnType<typeof useMeetings>["meetings"];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} />
        ))}
      </div>
    </section>
  );
}
