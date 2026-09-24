const encoder = new TextEncoder();

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bufferToHex(signature);
}

export const SESSION_COOKIE_NAME = "crmaster_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 jours

export async function createSessionToken(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  const signature = await hmac(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expires = Number(payload);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = await hmac(secret, payload);
  return timingSafeEqual(expected, signature);
}

export function checkPassword(input: string, expected: string): boolean {
  return timingSafeEqual(input, expected);
}
