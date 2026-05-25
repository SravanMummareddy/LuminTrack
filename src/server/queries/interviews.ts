import { prisma } from "@/server/db";
import { PAGE_SIZE } from "@/lib/filters";

/**
 * Interview rounds across all of a candidate's submissions — powers the
 * interview history section on the candidate detail page (spec §9.7).
 */
export async function getCandidateInterviewRounds(
  candidateId: string,
  opts: { page?: number } = {},
) {
  const where = { submission: { candidateId } };
  const total = await prisma.interviewRound.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.interviewRound.findMany({
    where,
    orderBy: [
      { submission: { submittedAt: "desc" } },
      { roundOrder: "asc" },
    ],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      submission: {
        select: { id: true, job: { select: { title: true } } },
      },
    },
  });

  return { rows, total, page };
}

export type CandidateInterviewRow = Awaited<
  ReturnType<typeof getCandidateInterviewRounds>
>["rows"][number];
