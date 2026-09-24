"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorUp, Users } from "lucide-react";
import { useMeetings } from "@/lib/store";
import type { MeetingType } from "@/lib/types";
import { TRANSCRIPTION_PROFILES } from "@/lib/transcriptionProfiles";
import { REPORT_FORMATS } from "@/lib/reportFormats";

export default function NewMeetingPage() {
  const router = useRouter();
  const { createMeeting } = useMeetings();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<MeetingType>("visio");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [transcriptionProfile, setTranscriptionProfile] = useState("none");
  const [reportFormat, setReportFormat] = useState("brut");
  const [speakersExpected, setSpeakersExpected] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const meeting = await createMeeting({
      title,
      type,
      date,
      time,
      participants,
      notes,
      transcriptionProfile,
      reportFormat,
      speakersExpected: speakersExpected ? Number(speakersExpected) : undefined,
    });
    router.push(`/reunions/${meeting.id}`);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Nouvelle réunion</h1>
      <p className="mb-8 text-sm text-slate-500">
        Renseignez les informations de la réunion. Vous pourrez lancer l&apos;enregistrement
        depuis sa page dédiée.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
              icon={MonitorUp}
              title="Visioconférence"
              description="Capture l'audio d'un onglet, d'une appli (Zoom, Meet, Teams…) ou de tout l'écran."
            />
            <TypeOption
              value="presentiel"
              current={type}
              onSelect={setType}
              icon={Users}
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
            Nombre de personnes qui vont parler{" "}
            <span className="font-normal text-slate-400">(optionnel, vous inclus)</span>
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={speakersExpected}
            onChange={(e) => setSpeakersExpected(e.target.value)}
            placeholder="Ex : 3"
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            Si vous le connaissez, l&apos;identification des intervenants est plus fiable.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Profil de vocabulaire{" "}
            <span className="font-normal text-slate-400">
              (améliore la reconnaissance des termes spécifiques)
            </span>
          </label>
          <select
            value={transcriptionProfile}
            onChange={(e) => setTranscriptionProfile(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {TRANSCRIPTION_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {TRANSCRIPTION_PROFILES.find((p) => p.id === transcriptionProfile)?.description}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Mise en forme du compte rendu{" "}
            <span className="font-normal text-slate-400">
              (généré automatiquement, en plus du texte brut)
            </span>
          </label>
          <select
            value={reportFormat}
            onChange={(e) => setReportFormat(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {REPORT_FORMATS.map((format) => (
              <option key={format.id} value={format.id}>
                {format.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">
            {REPORT_FORMATS.find((f) => f.id === reportFormat)?.description}
          </p>
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
            className="rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
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
  icon: Icon,
  title,
  description,
}: {
  value: MeetingType;
  current: MeetingType;
  onSelect: (v: MeetingType) => void;
  icon: typeof MonitorUp;
  title: string;
  description: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-xl border px-4 py-3 text-left transition-all ${
        active
          ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Icon size={15} className={active ? "text-brand-600" : "text-slate-400"} />
        <div className="text-sm font-semibold text-slate-900">{title}</div>
      </div>
      <div className="text-xs text-slate-500">{description}</div>
    </button>
  );
}
