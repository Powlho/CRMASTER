"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { Meeting } from "@/lib/types";
import { meetingInfoLines, reportSections, transcriptTurns } from "@/lib/meetingText";

// Version imprimable d'une réunion : « Enregistrer au format PDF » dans la fenêtre
// d'impression du navigateur (ordinateur ou téléphone) donne le PDF.
export default function PrintPage({ params }: { params: { id: string } }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withTranscript, setWithTranscript] = useState(true);

  useEffect(() => {
    fetch(`/api/meetings/${params.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setMeeting((await r.json()) as Meeting);
      })
      .catch(() => setError("Réunion introuvable."));
  }, [params.id]);

  useEffect(() => {
    if (meeting) document.title = meeting.title;
  }, [meeting]);

  if (error) return <p className="p-8 text-sm text-slate-500">{error}</p>;
  if (!meeting) return <p className="p-8 text-sm text-slate-400">Chargement…</p>;

  const turns = transcriptTurns(meeting);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-[52rem] flex-wrap items-center gap-4 px-4 py-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Printer size={16} />
          Imprimer / Enregistrer en PDF
        </button>
        {turns.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={withTranscript}
              onChange={(e) => setWithTranscript(e.target.checked)}
            />
            Inclure la transcription complète
          </label>
        )}
        <p className="w-full text-xs text-slate-500">
          Dans la fenêtre qui s&apos;ouvre, choisissez « Enregistrer au format PDF » comme
          imprimante.
        </p>
      </div>

      <article className="mx-auto mb-8 max-w-[52rem] bg-white px-10 py-12 text-[13px] leading-relaxed text-slate-800 shadow-sm print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">{meeting.title}</h1>
        <div className="mb-8 space-y-0.5 text-slate-500">
          {meetingInfoLines(meeting).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        {reportSections(meeting).map((section) => (
          <section key={section.title} className="mb-8">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-base font-semibold text-slate-900">
              {section.title}
            </h2>
            <p className="whitespace-pre-wrap">{section.text}</p>
          </section>
        ))}

        {meeting.notes.trim() && (
          <section className="mb-8">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-base font-semibold text-slate-900">
              Notes
            </h2>
            <p className="whitespace-pre-wrap">{meeting.notes.trim()}</p>
          </section>
        )}

        {withTranscript && turns.length > 0 && (
          <section className="break-before-page">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-base font-semibold text-slate-900">
              Transcription
            </h2>
            <div className="space-y-2">
              {turns.map((t, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {t.speaker && <strong>{t.speaker} : </strong>}
                  {t.text}
                </p>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
