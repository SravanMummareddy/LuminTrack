"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  getCurrentUser,
} from "@/lib/session";
import { loginSchema } from "@/lib/validation/auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string };

// 5 attempts per 15 minutes per email+IP. Slows credential stuffing without
// locking out legitimate users who fat-finger their password. A looser
// per-account bucket catches a distributed / IP-rotating attack on one account
// that the per-IP bucket alone would miss.
const LOGIN_LIMIT = 5;
const LOGIN_ACCT_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * The trusted client IP. On Vercel, `x-real-ip` is set by the edge to the real
 * client IP. `x-forwarded-for` can be PREPENDED with a client-supplied value,
 * so its leftmost entry is attacker-controlled (the old bug — rotating the
 * header landed the attacker in a fresh bucket every request, defeating the
 * limit). Prefer `x-real-ip`; fall back to the RIGHTMOST forwarded hop (the one
 * our proxy appended), never the leftmost.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const parts =
    h
      .get("x-forwarded-for")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  return parts.at(-1) ?? "unknown";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const ip = await clientIp();
  const ipKey = `login:${email}:${ip}`;
  const acctKey = `login-acct:${email}`;

  // Two buckets: per-(email, IP) throttles a single source; per-email alone
  // throttles a distributed attack on one account across many IPs.
  const ipLimit = rateLimit(ipKey, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  const acctLimit = rateLimit(acctKey, LOGIN_ACCT_LIMIT, LOGIN_WINDOW_MS);
  if (!ipLimit.ok || !acctLimit.ok) {
    const retryMs = Math.max(
      ipLimit.ok ? 0 : ipLimit.retryAfterMs,
      acctLimit.ok ? 0 : acctLimit.retryAfterMs,
    );
    const mins = Math.max(1, Math.ceil(retryMs / 60000));
    return {
      error: `Too many login attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic message whether the email is unknown, inactive, or the
  // password is wrong — avoids revealing which accounts exist.
  if (!user || !user.isActive) {
    return { error: "Invalid email or password." };
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { error: "Invalid email or password." };
  }

  // Success — clear both failure counters so a single typo doesn't keep eating
  // the budget for the next 15 minutes.
  resetRateLimit(ipKey);
  resetRateLimit(acctKey);
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  // Guard against unauthenticated POSTs — without this, a forged request
  // would still clear cookies and bounce to /login (low-stakes, but no
  // reason to honor it). For genuine sessions, this is the normal logout.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  await destroySession();
  redirect("/login");
}
