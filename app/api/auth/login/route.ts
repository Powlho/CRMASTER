import { NextRequest, NextResponse } from "next/server";
import {
  checkPassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!appPassword || !authSecret) {
    return NextResponse.json(
      { error: "APP_PASSWORD et/ou AUTH_SECRET ne sont pas configurés sur le serveur." },
      { status: 500 }
    );
  }

  const { password } = (await req.json()) as { password?: string };
  if (!password || !checkPassword(password, appPassword)) {
    return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 401 });
  }

  const token = await createSessionToken(authSecret);
  const isHttps =
    req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
