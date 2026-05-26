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
// locking out legitimate users who fat-finger their password.
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

async function loginRateKey(email: string): Promise<string> {
  const h = await headers();
  // Vercel and most proxies put the original client IP in x-forwarded-for.
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return `login:${email}:${ip}`;
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
  const key = await loginRateKey(email);

  const limit = rateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil(limit.retryAfterMs / 60000));
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

  // Success — clear the failure counter so a single typo doesn't keep eating
  // the budget for the next 15 minutes.
  resetRateLimit(key);
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
