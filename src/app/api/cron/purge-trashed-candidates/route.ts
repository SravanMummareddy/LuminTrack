import { purgeExpiredTrash } from "@/server/candidate-erase";
import { purgeExpiredTrashedJobs } from "@/server/job-erase";

/**
 * Scheduled purge: permanently erases trashed candidates AND trashed jobs whose
 * 30-day retention window has lapsed (candidates: shred files + anonymize; jobs:
 * back up + hard-remove-or-tombstone). Wired to a daily Vercel Cron (see
 * vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`; we reject
 * anything else so the endpoint isn't publicly triggerable. If CRON_SECRET is
 * unset, the job is disabled (fails closed).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [candidatesErased, jobsErased] = await Promise.all([
    purgeExpiredTrash(),
    purgeExpiredTrashedJobs(),
  ]);
  return Response.json({ ok: true, candidatesErased, jobsErased });
}
