import { prisma, scopedPrisma } from "@/server/db";
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
  // System task across every tenant: iterate active orgs and purge each one with
  // its own scoped client (there is no user session here, so we can't use
  // getScopedPrisma). Foundation has a single org → one iteration.
  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let candidatesErased = 0;
  let jobsErased = 0;
  for (const org of orgs) {
    const db = scopedPrisma(org.id);
    const [c, j] = await Promise.all([
      purgeExpiredTrash(db),
      purgeExpiredTrashedJobs(db),
    ]);
    candidatesErased += c;
    jobsErased += j;
  }
  return Response.json({ ok: true, candidatesErased, jobsErased });
}
