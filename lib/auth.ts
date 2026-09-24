import { base64UrlDecode, base64UrlEncode, hmac, timingSafeEqual } from "@/lib/crypto";

export const SESSION_COOKIE_NAME = "crmaster_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 jours

interface SessionPayload {
  userId: string;
  expires: number;
}

export async function createSessionToken(secret: string, userId: string): Promise<string> {
  const payload: SessionPayload = {
    userId,
    expires: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(secret, payloadB64);
  return `${payloadB64}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<{ userId: string } | null> {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  const expected = await hmac(secret, payloadB64);
  if (!timingSafeEqual(expected, signature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as SessionPayload;
    if (!payload.userId || Date.now() > payload.expires) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
