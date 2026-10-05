import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/login",
  "/setup-requis",
  "/api/auth/login",
  // Application installable : le navigateur lit ces fichiers sans cookie de session.
  "/manifest.webmanifest",
  "/sw.js",
  // Cible du partage Android, normalement interceptée par le service worker (voir
  // app/partager-cible/route.ts) : aucune donnée n'y est lue.
  "/partager-cible",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/icons/")) {
    return NextResponse.next();
  }

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.redirect(new URL("/setup-requis", req.url));
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token, authSecret);
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", session.userId);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
