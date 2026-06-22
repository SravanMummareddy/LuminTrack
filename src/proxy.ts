import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

const PUBLIC_PATHS = ["/login"];

// Code-generated metadata routes have no file extension, so the matcher below
// doesn't skip them — bypass auth explicitly so icons stay publicly fetchable
// (the browser and iOS request them outside any signed-in context).
const ASSET_PATHS = ["/icon", "/apple-icon"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ASSET_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  // Unauthenticated users may only see public pages.
  if (!userId && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Signed-in users have no reason to see the login page.
  if (userId && isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except API routes, ALL Next internals, and static files.
  // NB: must exclude the whole `_next/` tree, not just `_next/static` +
  // `_next/image` — otherwise the middleware runs on `/_next/webpack-hmr` and
  // returns an HTTP response on the WebSocket upgrade, breaking Turbopack's HMR
  // connection (and, downstream, client hydration in dev).
  matcher: ["/((?!api|_next|favicon.ico|.*\\.).*)"],
};
