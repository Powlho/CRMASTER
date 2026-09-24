import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/setup-requis", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const appPassword = process.env.APP_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;
  if (!appPassword || !authSecret) {
    return NextResponse.redirect(new URL("/setup-requis", req.url));
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token, authSecret);
  if (!valid) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
