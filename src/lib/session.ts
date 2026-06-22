import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/server/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionToken,
  verifySessionToken,
} from "@/lib/auth-token";

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * The currently signed-in user, or null. Memoized per request so multiple
 * calls within one render share a single database lookup.
 */
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return user;
});

/** Use in Server Components/Actions that require a signed-in user. */
export async function requireUser() {
  const user = await getCurrentUser();
  // Redirect through the logout route rather than straight to /login: if the
  // request carried a valid-JWT-but-dead-session cookie (e.g. the user was
  // wiped by a reseed), the proxy considers it "authenticated" and would bounce
  // /login back here in an infinite loop. /api/auth/logout clears the cookie
  // first, so /login is then reachable. A cookie-less request never reaches
  // here (the proxy redirects it to /login directly), so this only fires for a
  // stale session — where clearing it is exactly right.
  if (!user) redirect("/api/auth/logout");
  return user;
}
