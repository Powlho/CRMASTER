import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { ensureBootstrapAdmin, verifyCredentials } from "@/lib/data/users";
import { migrateOwnerlessMeetings } from "@/lib/data/store";

export async function POST(req: NextRequest) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json(
      { error: "AUTH_SECRET n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  const adminId = await ensureBootstrapAdmin();
  if (adminId) await migrateOwnerlessMeetings(adminId);

  const { username, password } = (await req.json()) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return NextResponse.json({ error: "Identifiants requis." }, { status: 400 });
  }

  const user = await verifyCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "Identifiants incorrects." }, { status: 401 });
  }

  const token = await createSessionToken(authSecret, user.id);
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
