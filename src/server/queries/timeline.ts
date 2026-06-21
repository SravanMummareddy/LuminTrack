import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export type TimelineEntityType = "JOB" | "CANDIDATE" | "SUBMISSION" | "CONSULTANT";

/**
 * Hard ceiling on how many activity rows a single timeline view will fetch.
 * The UI collapses to 5 by default and pages by 20 when expanded, so even a
 * very chatty job (hundreds of status changes + interview events) doesn't
 * need more than this. Older entries are simply not loaded.
 */
const TIMELINE_MAX = 200;

/**
 * Activity for one entity, rolled up with the activity of its descendants:
 * a job/candidate also shows its submissions' and interview rounds' activity;
 * a submission also shows its rounds'. One unified, de-duplicated feed for the
 * timeline UI on the job / candidate / submission detail pages.
 */
export async function getTimelineFor(
  entityType: TimelineEntityType,
  id: string,
) {
  const or: Prisma.ActivityWhereInput[] = [];

  if (entityType === "CONSULTANT") {
    // Bench consultant — own activity only (no descendant entities yet).
    or.push({ benchConsultantId: id });
  } else if (entityType === "SUBMISSION") {
    or.push({ submissionId: id });
    const rounds = await prisma.interviewRound.findMany({
      where: { submissionId: id },
      select: { id: true },
    });
    const roundIds = rounds.map((r) => r.id);
    if (roundIds.length) or.push({ interviewRoundId: { in: roundIds } });
  } else {
    // JOB or CANDIDATE — own activity, plus every submission and round below it.
    or.push(entityType === "JOB" ? { jobId: id } : { candidateId: id });
    const submissions = await prisma.submission.findMany({
      where: entityType === "JOB" ? { jobId: id } : { candidateId: id },
      select: { id: true, interviewRounds: { select: { id: true } } },
    });
    const submissionIds = submissions.map((s) => s.id);
    const roundIds = submissions.flatMap((s) =>
      s.interviewRounds.map((r) => r.id),
    );
    if (submissionIds.length) or.push({ submissionId: { in: submissionIds } });
    if (roundIds.length) or.push({ interviewRoundId: { in: roundIds } });
  }

  return prisma.activity.findMany({
    where: { OR: or },
    orderBy: { createdAt: "desc" },
    include: { performedBy: { select: { fullName: true } } },
    take: TIMELINE_MAX,
  });
}

export type TimelineEntry = Awaited<ReturnType<typeof getTimelineFor>>[number];
