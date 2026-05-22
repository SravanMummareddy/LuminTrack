import { prisma } from "@/server/db";

/**
 * Interview rounds across all of a candidate's submissions — powers the
 * interview history section on the candidate detail page (spec §9.7).
 */
export function getCandidateInterviewRounds(candidateId: string) {
  return prisma.interviewRound.findMany({
    where: { submission: { candidateId } },
    orderBy: [
      { submission: { submittedAt: "desc" } },
      { roundOrder: "asc" },
    ],
    include: {
      submission: {
        select: { id: true, job: { select: { title: true } } },
      },
    },
  });
}

export type CandidateInterviewRow = Awaited<
  ReturnType<typeof getCandidateInterviewRounds>
>[number];
