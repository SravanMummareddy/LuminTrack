/**
 * Wave 7 — transactional email over Resend's HTTP API. Kept to a plain `fetch`
 * (no SDK dependency) since we send a handful of templated emails. Fails SAFE:
 * with `RESEND_API_KEY` unset (dev / preview) it logs and no-ops instead of
 * throwing, so a missing key never breaks a submission or the digest cron.
 *
 * Setup (owner, one-time): create a Resend account, verify the sending domain,
 * set `RESEND_API_KEY` + `EMAIL_FROM` (e.g. "LuminTrack <noreply@yourdomain>")
 * in Vercel env. Until the domain is verified, Resend's `onboarding@resend.dev`
 * only delivers to the account owner's address.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Absolute base URL for links inside emails (no request context in the cron). */
export function appUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://lumin-track.vercel.app"
  );
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

/** Send one email. Returns true if handed to Resend, false if skipped/failed —
 *  never throws, so callers can fire-and-forget without a try/catch. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "LuminTrack <onboarding@resend.dev>";
  if (!apiKey) {
    console.info(`[email] skipped (no RESEND_API_KEY): "${msg.subject}" → ${msg.to}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[email] Resend ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}
