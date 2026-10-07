import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { NextRequest } from "next/server";
import { base64UrlDecode, base64UrlEncode, hmac, timingSafeEqual } from "@/lib/crypto";

// Connexion Google Agenda (lecture seule), propre à chaque compte : OAuth 2.0 avec un jeton
// de rafraîchissement stocké chiffré sur le serveur.

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const TOKENS_FILE = path.join(DATA_DIR, "google-tokens.json");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET
  );
}

/** Adresse publique de l'app : APP_URL si renseignée, sinon déduite de la requête. */
export function appBaseUrl(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] || req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  return `${proto}://${host}`;
}

export function redirectUri(req: NextRequest): string {
  return `${appBaseUrl(req)}/api/google/callback`;
}

// --- Stockage chiffré des jetons -------------------------------------------------------

interface StoredConnection {
  email: string | null;
  refreshToken: string; // chiffré
  connectedAt: string;
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(`${process.env.AUTH_SECRET}:google-tokens`).digest();
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

function decrypt(value: string): string {
  const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

let queue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Record<string, StoredConnection>> {
  try {
    return JSON.parse(await fs.readFile(TOKENS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function mutate(fn: (all: Record<string, StoredConnection>) => void): Promise<void> {
  const run = queue.then(async () => {
    const all = await readAll();
    fn(all);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${TOKENS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    await fs.rename(tmp, TOKENS_FILE);
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function getConnection(userId: string): Promise<{ email: string | null } | null> {
  const conn = (await readAll())[userId];
  return conn ? { email: conn.email } : null;
}

export async function disconnect(userId: string): Promise<void> {
  const conn = (await readAll())[userId];
  if (conn) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(decrypt(conn.refreshToken))}`, {
        method: "POST",
      });
    } catch {
      // révocation impossible : on oublie quand même le jeton
    }
  }
  await mutate((all) => {
    delete all[userId];
  });
}

// --- OAuth -----------------------------------------------------------------------------

// Le paramètre state lie le retour de Google au compte connecté (protection CSRF).
async function signState(userId: string): Promise<string> {
  const payload = base64UrlEncode(
    JSON.stringify({ userId, nonce: randomBytes(8).toString("hex"), exp: Date.now() + STATE_MAX_AGE_MS })
  );
  return `${payload}.${await hmac(process.env.AUTH_SECRET as string, payload)}`;
}

async function verifyState(state: string, userId: string): Promise<boolean> {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(process.env.AUTH_SECRET as string, payload);
  if (!timingSafeEqual(expected, signature)) return false;
  try {
    const data = JSON.parse(base64UrlDecode(payload)) as { userId: string; exp: number };
    return data.userId === userId && Date.now() < data.exp;
  } catch {
    return false;
  }
}

export async function authorizationUrl(req: NextRequest, userId: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Force l'envoi d'un jeton de rafraîchissement, même si le compte avait déjà autorisé l'app.
    prompt: "consent",
    include_granted_scopes: "true",
    state: await signState(userId),
  });
  return `${AUTH_URL}?${params}`;
}

export async function handleCallback(
  req: NextRequest,
  userId: string,
  code: string,
  state: string
): Promise<void> {
  if (!(await verifyState(state, userId))) {
    throw new Error("Lien de connexion expiré ou invalide : recommencez depuis l'Agenda.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    id_token?: string;
    error_description?: string;
  };
  if (!res.ok || !data.refresh_token) {
    throw new Error(
      `Google a refusé la connexion${data.error_description ? ` : ${data.error_description}` : "."}`
    );
  }
  // L'id_token vient directement de Google (échange serveur à serveur) : on y lit l'e-mail
  // sans vérifier la signature, il ne sert qu'à l'affichage.
  let email: string | null = null;
  try {
    email = JSON.parse(base64UrlDecode(data.id_token?.split(".")[1] ?? "")).email ?? null;
  } catch {
    email = null;
  }
  const refreshToken = encrypt(data.refresh_token);
  await mutate((all) => {
    all[userId] = { email, refreshToken, connectedAt: new Date().toISOString() };
  });
}

export class GoogleReconnectError extends Error {}

// Jetons d'accès (valables une heure) gardés en mémoire du process.
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(userId: string): Promise<string> {
  const cached = accessTokens.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const conn = (await readAll())[userId];
  if (!conn) throw new GoogleReconnectError("Google Agenda n'est pas connecté.");
  let refreshToken: string;
  try {
    refreshToken = decrypt(conn.refreshToken);
  } catch {
    throw new GoogleReconnectError("Connexion Google illisible (AUTH_SECRET modifiée ?) : reconnectez-vous.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") {
      throw new GoogleReconnectError("L'accès à Google Agenda a expiré ou a été retiré : reconnectez-vous.");
    }
    throw new Error(`Google n'a pas renouvelé l'accès (${res.status}).`);
  }
  accessTokens.set(userId, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

// --- Événements -----------------------------------------------------------------------

export interface AgendaEvent {
  id: string;
  calendar: string;
  color: string | null;
  title: string;
  /** dateTime ISO (avec fuseau) ou date AAAA-MM-JJ pour un événement sur la journée. */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  meetLink: string | null;
  attendees: { name: string | null; email: string | null; self: boolean }[];
  htmlLink: string | null;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean; resource?: boolean; responseStatus?: string }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

async function googleGet<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new GoogleReconnectError("Accès Google refusé : reconnectez-vous.");
  if (!res.ok) throw new Error(`Erreur Google Agenda (${res.status}).`);
  return (await res.json()) as T;
}

/** Événements des agendas affichés dans Google Agenda, entre deux dates ISO. */
export async function listEvents(userId: string, timeMin: string, timeMax: string): Promise<AgendaEvent[]> {
  const token = await accessToken(userId);
  const calendars = await googleGet<{
    items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; selected?: boolean; primary?: boolean }[];
  }>(token, `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader`);
  const shown = (calendars.items ?? []).filter((c) => c.primary || c.selected).slice(0, 15);

  const perCalendar = await Promise.all(
    shown.map(async (cal) => {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      try {
        const data = await googleGet<{ items?: GoogleEvent[] }>(
          token,
          `${CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`
        );
        return (data.items ?? [])
          .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
          .map(
            (e): AgendaEvent => ({
              id: e.id,
              calendar: cal.summaryOverride || cal.summary || cal.id,
              color: cal.backgroundColor ?? null,
              title: e.summary || "(Sans titre)",
              start: (e.start?.dateTime || e.start?.date) as string,
              end: (e.end?.dateTime || e.end?.date || e.start?.dateTime || e.start?.date) as string,
              allDay: !e.start?.dateTime,
              location: e.location ?? null,
              description: e.description ?? null,
              meetLink:
                e.hangoutLink ??
                e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
                null,
              attendees: (e.attendees ?? [])
                .filter((a) => !a.resource && a.responseStatus !== "declined")
                .map((a) => ({ name: a.displayName ?? null, email: a.email ?? null, self: Boolean(a.self) })),
              htmlLink: e.htmlLink ?? null,
            })
          );
      } catch (err) {
        if (err instanceof GoogleReconnectError) throw err;
        return []; // un agenda illisible n'empêche pas d'afficher les autres
      }
    })
  );
  return perCalendar.flat().sort((a, b) => a.start.localeCompare(b.start));
}
