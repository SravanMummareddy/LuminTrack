import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-token";

/**
 * Clears the session cookie and bounces to /login. This is the redirect target
 * for `requireUser()` when the cookie's JWT is valid but its user no longer
 * exists or is inactive (e.g. after a reseed or a deactivation) — the proxy
 * trusts the JWT and lets such a request through, the page can't satisfy it, and
 * without clearing the cookie the proxy would just bounce /login back to / in an
 * infinite loop. A Route Handler is the sanctioned place to mutate cookies (an
 * RSC render can't), so the dead session is deleted here.
 *
 * GET so it can be a plain redirect target; clearing a session is idempotent.
 */
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
