import { purgeExpiredTrash } from "@/server/candidate-erase";

/**
 * Scheduled purge: permanently erases trashed candidates whose 30-day retention
 * window has lapsed (shreds files, anonymizes the record). Wired to a daily
 * Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer
 * $CRON_SECRET`; we reject anything else so the endpoint isn't publicly
 * triggerable. If CRON_SECRET is unset, the job is disabled (fails closed).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const erased = await purgeExpiredTrash();
  return Response.json({ ok: true, erased });
}
