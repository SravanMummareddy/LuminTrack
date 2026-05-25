import { prisma } from "@/server/db";
import { SUB_PAGE_SIZE as PAGE_SIZE } from "@/lib/filters";

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

/**
 * Same data as `getCandidateInterviewRounds`, but reshaped into one row per
 * submission with its rounds nested. Powers the grouped interview history
 * view on the candidate detail page — recruiters scan by *job*, then drill
 * into the rounds when they care.
 *
 * Paged on the *submission* count, not the round count, so a candidate with
 * 1 submission × 8 rounds is one row, not eight.
 */
export async function getCandidateInterviewsGroupedByJob(
  candidateId: string,
  opts: { page?: number } = {},
) {
  // A submission is in the grouped view if it has at least one round.
  const where = {
    candidateId,
    interviewRounds: { some: {} },
  };
  const total = await prisma.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await prisma.submission.findMany({
    where,
    // Most-recently-active submission first. We can't `orderBy: { interviewRounds: { _max: { scheduledAt: "desc" } } }`
    // directly in Prisma 7 so we fall back to the submission's own activity timestamp;
    // ties broken by submittedAt. Good enough — rounds within the row are still
    // ordered by roundOrder.
    orderBy: [{ updatedAt: "desc" }, { submittedAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      seq: true,
      status: true,
      submittedAt: true,
      job: {
        select: { id: true, title: true, client: { select: { name: true } } },
      },
      interviewRounds: {
        orderBy: { roundOrder: "asc" },
        select: {
          id: true,
          roundOrder: true,
          roundName: true,
          interviewType: true,
          interviewMode: true,
          interviewPlatform: true,
          meetingLink: true,
          interviewerName: true,
          scheduledAt: true,
          result: true,
          feedback: true,
        },
      },
    },
  });

  return { rows, total, page };
}

export type CandidateInterviewGroup = Awaited<
  ReturnType<typeof getCandidateInterviewsGroupedByJob>
>["rows"][number];
