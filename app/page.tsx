"use client";

import Link from "next/link";
import { useMeetings } from "@/lib/store";
import MeetingCard from "@/components/MeetingCard";

export default function DashboardPage() {
  const { meetings, ready } = useMeetings();

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

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Réunions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Créez vos réunions, lancez l&apos;enregistrement et suivez la transcription.
          </p>
        </div>
        <Link
          href="/reunions/nouvelle"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
        >
          + Nouvelle réunion
        </Link>
      </div>

      {!ready ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : meetings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="mb-4 text-slate-500">
            Aucune réunion pour le moment. Créez-en une pour commencer à enregistrer.
          </p>
          <Link
            href="/reunions/nouvelle"
            className="inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
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
