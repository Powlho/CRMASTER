import { bufferToHex, hexToBytes, timingSafeEqual } from "@/lib/crypto";

const ITERATIONS = 100_000;
const encoder = new TextEncoder();

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bufferToHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `${ITERATIONS}:${bufferToHex(salt.buffer)}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsStr, saltHex, hashHex] = stored.split(":");
  const iterations = Number(iterationsStr);
  if (!iterations || !saltHex || !hashHex) return false;
  const salt = hexToBytes(saltHex);
  const computed = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(computed, hashHex);
}
