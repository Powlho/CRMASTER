"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMeetings } from "@/lib/store";
import type { MeetingType } from "@/lib/types";

export default function NewMeetingPage() {
  const router = useRouter();
  const { createMeeting } = useMeetings();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<MeetingType>("visio");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const meeting = createMeeting({ title, type, date, time, participants, notes });
    router.push(`/reunions/${meeting.id}`);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Nouvelle réunion</h1>
      <p className="mb-8 text-sm text-slate-500">
        Renseignez les informations de la réunion. Vous pourrez lancer l&apos;enregistrement
        depuis sa page dédiée.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Titre</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Point hebdomadaire équipe produit"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Type de réunion</label>
          <div className="grid grid-cols-2 gap-3">
            <TypeOption
              value="visio"
              current={type}
              onSelect={setType}
              title="Visioconférence"
              description="Capture l'audio d'un onglet ou d'une fenêtre partagée (Zoom, Meet, Teams…)."
            />
            <TypeOption
              value="presentiel"
              current={type}
              onSelect={setType}
              title="Présentiel"
              description="Capture l'audio via le microphone de cet appareil."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Heure</label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Participants <span className="font-normal text-slate-400">(séparés par des virgules)</span>
          </label>
          <input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder="Ex : Marie Dupont, Jean Martin"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Notes <span className="font-normal text-slate-400">(optionnel)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Ordre du jour, contexte…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
          >
            Créer la réunion
          </button>
        </div>
      </form>
    </div>
  );
}

function TypeOption({
  value,
  current,
  onSelect,
  title,
  description,
}: {
  value: MeetingType;
  current: MeetingType;
  onSelect: (v: MeetingType) => void;
  title: string;
  description: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
        active
          ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{description}</div>
    </button>
  );
}
