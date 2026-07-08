import { runScheduledBackup } from "@/server/backup";

// Backups can take a moment on a large audit log; give the function room.
export const maxDuration = 300;

/**
 * Scheduled database backup. Writes a gzipped, restore-grade JSON snapshot to
 * the configured sink (Vercel Blob today) under a daily key, plus a monthly key
 * on the 1st, then prunes past the retention window. Wired to a daily Vercel
 * Cron (see vercel.json), running before the trash purge so a snapshot captures
 * data prior to any erasure.
 *
 * Auth mirrors the purge cron: Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * With CRON_SECRET unset the job fails closed (so it can't be triggered publicly).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const summary = await runScheduledBackup();
  return Response.json({ ok: true, ...summary });
}
