"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  TriangleAlert,
  Users,
  Video,
} from "lucide-react";
import { useMeetings } from "@/lib/store";
import type { AgendaEvent } from "@/lib/data/google";

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  redirectUri: string;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lundi
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Jour local (AAAA-MM-JJ) et heure locale (HH:MM) du début de l'événement. */
function localStart(event: AgendaEvent): { day: string; time: string | null } {
  if (event.allDay) return { day: event.start.slice(0, 10), time: null };
  const d = new Date(event.start);
  return { day: isoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function localEndTime(event: AgendaEvent): string | null {
  if (event.allDay) return null;
  const d = new Date(event.end);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Les descriptions Google peuvent contenir du HTML : on n'en garde que le texte.
function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n"),
    "text/html"
  );
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

const VISIO_PATTERN = /(meet\.google|zoom\.us|teams\.microsoft|teams\.live|webex|whereby|https?:\/\/)/i;

function isVisio(event: AgendaEvent): boolean {
  return Boolean(event.meetLink) || VISIO_PATTERN.test(event.location ?? "");
}

/** Lien vers « Nouvelle réunion » prérempli avec les informations de l'événement. */
function newMeetingHref(event: AgendaEvent): string {
  const { day, time } = localStart(event);
  const participants = event.attendees
    .filter((a) => !a.self)
    .map((a) => a.name || a.email)
    .filter(Boolean)
    .join(", ");
  const notes = [
    event.meetLink ? `Lien visio : ${event.meetLink}` : null,
    event.location && event.location !== event.meetLink ? `Lieu : ${event.location}` : null,
    event.description ? plainText(event.description) : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1500);
  const params = new URLSearchParams({
    event: event.id,
    title: event.title,
    date: day,
    type: isVisio(event) ? "visio" : "presentiel",
  });
  if (time) params.set("time", time);
  if (participants) params.set("participants", participants.slice(0, 500));
  if (notes) params.set("notes", notes);
  return `/reunions/nouvelle?${params}`;
}

export default function AgendaPage({ searchParams }: { searchParams: { erreur?: string } }) {
  const router = useRouter();
  const { meetings } = useMeetings();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [events, setEvents] = useState<AgendaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(searchParams.erreur ?? null);
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      setError("Impossible de contacter le serveur.");
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Le message d'erreur du retour Google est affiché une fois, puis retiré de l'adresse.
  useEffect(() => {
    if (searchParams.erreur) router.replace("/agenda");
  }, [searchParams.erreur, router]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancelled = false;
    setLoading(true);
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    fetch(`/api/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Impossible de lire votre agenda.");
          setEvents([]);
          if (data?.reconnect) setStatus((s) => (s ? { ...s, connected: false } : s));
          return;
        }
        setEvents(data.events);
      })
      .catch(() => !cancelled && setError("Impossible de contacter le serveur."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status?.connected, weekStart]);

  const meetingByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of meetings) if (m.googleEventId) map.set(m.googleEventId, m.id);
    return map;
  }, [meetings]);

  async function handleDisconnect() {
    if (!window.confirm("Déconnecter Google Agenda de CRMASTER ?")) return;
    await fetch("/api/google/status", { method: "DELETE" }).catch(() => {});
    setEvents(null);
    loadStatus();
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = isoDate(new Date());
  const weekLabel = `${days[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} – ${days[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agenda</h1>
          <p className="mt-1 text-sm text-slate-500">
            Vos événements Google Agenda. Cliquez sur une réunion pour préparer son compte rendu.
          </p>
        </div>
        {status?.connected && (
          <div className="text-right text-xs text-slate-500">
            {status.email && <p>Connecté : {status.email}</p>}
            <button onClick={handleDisconnect} className="mt-0.5 text-slate-400 hover:text-red-600">
              Déconnecter
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {!status ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : !status.configured ? (
        <SetupInstructions redirectUri={status.redirectUri} />
      ) : !status.connected ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-white">
            <CalendarDays size={22} />
          </div>
          <p className="mb-1 font-medium text-slate-800">Connectez votre Google Agenda</p>
          <p className="mb-5 text-sm text-slate-500">
            Accès en lecture seule : CRMASTER affiche vos événements, sans jamais les modifier.
          </p>
          {/* Lien classique (pas de fetch) : la connexion passe par les pages de Google. */}
          <a
            href="/api/google/connect"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
          >
            Connecter Google Agenda
          </a>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
              aria-label="Semaine précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
              aria-label="Semaine suivante"
            >
              <ChevronRight size={16} />
            </button>
            <span className="ml-2 text-sm font-medium text-slate-700">{weekLabel}</span>
            {loading && <Loader2 size={15} className="ml-auto animate-spin text-brand-500" />}
          </div>

          <div className="space-y-4">
            {days.map((day) => {
              const key = isoDate(day);
              const dayEvents = (events ?? []).filter((e) => {
                if (!e.allDay) return localStart(e).day === key;
                // Événement sur plusieurs jours : affiché chaque jour couvert (fin exclusive).
                return e.start.slice(0, 10) <= key && key < e.end.slice(0, 10);
              });
              return (
                <section key={key}>
                  <h2
                    className={`mb-2 text-xs font-semibold uppercase tracking-wide ${
                      key === today ? "text-brand-600" : "text-slate-400"
                    }`}
                  >
                    {day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {key === today && " · aujourd'hui"}
                  </h2>
                  {dayEvents.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-xs text-slate-400">
                      {events ? "Aucun événement" : "…"}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {dayEvents.map((event) => (
                        <EventRow
                          key={`${event.calendar}-${event.id}-${key}`}
                          event={event}
                          meetingId={meetingByEvent.get(event.id)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function EventRow({ event, meetingId }: { event: AgendaEvent; meetingId?: string }) {
  const { time } = localStart(event);
  const end = localEndTime(event);
  const others = event.attendees.filter((a) => !a.self);
  return (
    <li className="group flex items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-brand-500">
      <span className="w-1 shrink-0" style={{ background: event.color ?? "#3b5fe0" }} />
      <Link href={newMeetingHref(event)} className="min-w-0 flex-1 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="w-24 shrink-0 font-mono text-xs tabular-nums text-slate-500">
            {time ? `${time}${end ? ` – ${end}` : ""}` : "Journée"}
          </span>
          <span className="truncate text-sm font-medium text-slate-900 group-hover:text-brand-700">
            {event.title}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[6.75rem] text-xs text-slate-500">
          {isVisio(event) ? (
            <span className="flex items-center gap-1">
              <Video size={12} /> Visio
            </span>
          ) : event.location ? (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          ) : null}
          {others.length > 0 && (
            <span className="flex items-center gap-1">
              <Users size={12} /> {others.length} participant{others.length > 1 ? "s" : ""}
            </span>
          )}
          <span className="text-slate-400">{event.calendar}</span>
        </div>
      </Link>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1 pr-3">
        {meetingId && (
          <Link
            href={`/reunions/${meetingId}`}
            className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            title="Une réunion CRMASTER existe déjà pour cet événement"
          >
            <FileText size={12} /> Compte rendu
          </Link>
        )}
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-1 text-slate-300 hover:text-slate-600"
            title="Ouvrir dans Google Agenda"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </li>
  );
}

function SetupInstructions({ redirectUri }: { redirectUri: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-slate-900">
        Google Agenda n&apos;est pas encore configuré sur le serveur
      </h2>
      <p className="mb-3 text-sm text-slate-500">À faire une fois par l&apos;administrateur :</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
        <li>
          Dans la{" "}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 hover:underline"
          >
            console Google Cloud
          </a>
          , créez un projet puis activez l&apos;API <strong>Google Calendar API</strong>.
        </li>
        <li>
          Écran de consentement OAuth : type <strong>Externe</strong>, puis{" "}
          <strong>Publier l&apos;application</strong> (en mode « Test », l&apos;accès expire au
          bout de 7 jours). Google affichera un avertissement « application non validée » :
          cliquez sur « Paramètres avancés » puis « Accéder à… ».
        </li>
        <li>
          Identifiants → Créer un <strong>ID client OAuth</strong> de type « Application Web »,
          avec cette URI de redirection autorisée :
          <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1">{redirectUri}</code>
        </li>
        <li>
          Renseignez dans <code className="rounded bg-slate-100 px-1">.env.local</code> sur le
          serveur :
          <code className="mt-1 block rounded bg-slate-100 px-2 py-1">
            GOOGLE_CLIENT_ID=…
            <br />
            GOOGLE_CLIENT_SECRET=…
            <br />
            APP_URL={redirectUri.replace(/\/api\/google\/callback$/, "")}
          </code>
        </li>
        <li>
          Redémarrez l&apos;app : <code className="rounded bg-slate-100 px-1">pm2 restart crmaster</code>
        </li>
      </ol>
    </section>
  );
}
