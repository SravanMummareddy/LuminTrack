"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/lib/password";
import {
  createSession,
  destroySession,
  getCurrentUser,
} from "@/lib/session";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = { error?: string };

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
