import { prisma } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  SUB_PAGE_SIZE as PAGE_SIZE,
  PAGE_SIZE as LIST_PAGE_SIZE,
  searchTerms,
  type DateRange,
  type SortDir,
  type SortState,
} from "@/lib/filters";

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
          supportNeeded: true,
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

// ─── Standalone interviews list (the "Interviews" tab) ───────────────────────

export type InterviewListFilters = {
  q?: string;
  recruiterId?: string[];
  scheduledRange?: DateRange;
  sort?: SortState;
  page?: number;
};

const INTERVIEW_SORTS: Record<
  string,
  (d: SortDir) => Prisma.InterviewRoundOrderByWithRelationInput
> = {
  date: (d) => ({ scheduledAt: d }),
  candidate: (d) => ({ submission: { candidate: { fullName: d } } }),
  client: (d) => ({ submission: { job: { client: { name: d } } } }),
  vendor: (d) => ({ submission: { job: { vendor: { name: d } } } }),
  location: (d) => ({ submission: { job: { location: d } } }),
  recruiter: (d) => ({ submission: { submittedBy: { fullName: d } } }),
  result: (d) => ({ result: d }),
};

export const INTERVIEW_SORT_KEYS = Object.keys(INTERVIEW_SORTS);
export const INTERVIEW_DEFAULT_SORT: SortState = { key: "date", dir: "desc" };

/**
 * Read-only roll-up of every scheduled interview round across all submissions —
 * the standalone Interviews list. Undated rounds are excluded so a date-sorted
 * sheet stays clean. Each row links back to its candidate and submission.
 */
export async function listInterviews(filters: InterviewListFilters) {
  const where: Prisma.InterviewRoundWhereInput = { scheduledAt: { not: null } };
  if (filters.scheduledRange?.gte || filters.scheduledRange?.lte)
    where.scheduledAt = { not: null, ...filters.scheduledRange };
  if (filters.recruiterId?.length)
    where.submission = { submittedById: { in: filters.recruiterId } };
  const terms = searchTerms(filters.q);
  if (terms.length)
    where.AND = terms.map((t) => ({
      OR: [
        {
          submission: {
            candidate: { fullName: { contains: t, mode: "insensitive" } },
          },
        },
        {
          submission: { job: { title: { contains: t, mode: "insensitive" } } },
        },
        {
          submission: {
            job: { client: { name: { contains: t, mode: "insensitive" } } },
          },
        },
      ],
    }));

  const sort = filters.sort ?? INTERVIEW_DEFAULT_SORT;
  const sortFn = INTERVIEW_SORTS[sort.key] ?? INTERVIEW_SORTS.date;
  const orderBy: Prisma.InterviewRoundOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await prisma.interviewRound.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await prisma.interviewRound.findMany({
    where,
    orderBy,
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
    select: {
      id: true,
      roundOrder: true,
      roundName: true,
      interviewType: true,
      scheduledAt: true,
      result: true,
      supportNeeded: true,
      feedback: true, // "Remarks" column (spreadsheet Interviews tab)
      submission: {
        select: {
          id: true,
          seq: true,
          candidate: {
            select: { id: true, fullName: true, skills: true, featuredSkills: true },
          },
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              client: { select: { name: true } },
              vendor: { select: { name: true } },
            },
          },
          submittedBy: { select: { fullName: true } },
        },
      },
    },
  });

  return { rows, total, page };
}

export type InterviewListRow = Awaited<
  ReturnType<typeof listInterviews>
>["rows"][number];
