import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export type TimelineEntityType = "JOB" | "CANDIDATE" | "SUBMISSION";

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

  if (entityType === "SUBMISSION") {
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
  });
}

export type TimelineEntry = Awaited<ReturnType<typeof getTimelineFor>>[number];
