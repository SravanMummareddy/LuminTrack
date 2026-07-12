import { getScopedPrisma } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import type {
  InterviewResult,
  InterviewType,
  Discipline,
} from "@/generated/prisma/enums";
import {
  SUB_PAGE_SIZE as PAGE_SIZE,
  PAGE_SIZE as LIST_PAGE_SIZE,
  searchTerms,
  type DateRange,
  type SortDir,
  type SortState,
} from "@/lib/filters";

/**
 * A candidate's interview rounds, reshaped into one row per submission with its
 * rounds nested. Powers the grouped interview history
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
  const db = await getScopedPrisma();
  // A submission is in the grouped view if it has at least one round.
  const where = {
    candidateId,
    interviewRounds: { some: {} },
  };
  const total = await db.submission.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const rows = await db.submission.findMany({
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
          supportMethod: true,
          supportProvider: { select: { name: true } },
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
  results?: InterviewResult[];
  interviewTypes?: InterviewType[];
  disciplines?: Discipline[];
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
  created: (d) => ({ createdAt: d }),
  updated: (d) => ({ updatedAt: d }),
};

export const INTERVIEW_SORT_KEYS = Object.keys(INTERVIEW_SORTS);
export const INTERVIEW_DEFAULT_SORT: SortState = { key: "date", dir: "desc" };

/** Shared filter → `where` builder for both the list and the schedule view.
 *  Undated rounds are always excluded so a date-keyed view stays clean. */
function buildInterviewWhere(
  filters: InterviewListFilters,
): Prisma.InterviewRoundWhereInput {
  const where: Prisma.InterviewRoundWhereInput = { scheduledAt: { not: null } };
  if (filters.scheduledRange?.gte || filters.scheduledRange?.lte)
    where.scheduledAt = { not: null, ...filters.scheduledRange };
  if (filters.results?.length) where.result = { in: filters.results };
  if (filters.interviewTypes?.length)
    where.interviewType = { in: filters.interviewTypes };
  // Recruiter + discipline both narrow via the parent submission — build one
  // sub-where so they compose instead of clobbering each other.
  const submissionWhere: Prisma.SubmissionWhereInput = {};
  if (filters.recruiterId?.length)
    submissionWhere.submittedById = { in: filters.recruiterId };
  if (filters.disciplines?.length)
    submissionWhere.candidate = { discipline: { in: filters.disciplines } };
  if (Object.keys(submissionWhere).length) where.submission = submissionWhere;
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
  return where;
}

// One row shape for both views — the table columns + the schedule cards read the
// same fields.
const INTERVIEW_LIST_SELECT = {
  id: true,
  roundOrder: true,
  roundName: true,
  interviewType: true,
  scheduledAt: true,
  result: true,
  supportNeeded: true,
  supportMethod: true,
  supportProvider: { select: { name: true } },
  feedback: true, // "Remarks" column (spreadsheet Interviews tab)
  createdAt: true,
  updatedAt: true,
  submission: {
    select: {
      id: true,
      seq: true,
      candidate: {
        select: {
          id: true,
          fullName: true,
          skills: true,
          featuredSkills: true,
          deletedAt: true,
          erasedAt: true,
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          location: true,
          deletedAt: true,
          erasedAt: true,
          client: { select: { name: true } },
          vendor: { select: { name: true } },
        },
      },
      submittedBy: { select: { fullName: true } },
    },
  },
} satisfies Prisma.InterviewRoundSelect;

/** Ceiling for the (unpaginated) schedule view. Awaiting/upcoming are bounded by
 *  the active pipeline; only the ever-growing Completed set needs a cap. Ordered
 *  date-desc, so the 500 kept are all future rounds + the most recent past. */
const SCHEDULE_CAP = 500;

/**
 * Read-only roll-up of every scheduled interview round across all submissions —
 * the standalone Interviews list. Undated rounds are excluded so a date-sorted
 * sheet stays clean. Each row links back to its candidate and submission.
 */
export async function listInterviews(filters: InterviewListFilters) {
  const db = await getScopedPrisma();
  const where = buildInterviewWhere(filters);

  const sort = filters.sort ?? INTERVIEW_DEFAULT_SORT;
  const sortFn = INTERVIEW_SORTS[sort.key] ?? INTERVIEW_SORTS.date;
  const orderBy: Prisma.InterviewRoundOrderByWithRelationInput[] = [
    sortFn(sort.dir),
    { id: "asc" },
  ];

  const total = await db.interviewRound.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);

  const rows = await db.interviewRound.findMany({
    where,
    orderBy,
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
    select: INTERVIEW_LIST_SELECT,
  });

  return { rows, total, page };
}

export type InterviewListRow = Awaited<
  ReturnType<typeof listInterviews>
>["rows"][number];

/**
 * The same filtered rounds as `listInterviews`, but unpaginated (capped at
 * `SCHEDULE_CAP`) and always date-desc — for the Schedule view, which groups by
 * time bucket rather than paging. `capped` is true when the filter matched more
 * than the ceiling, so the UI can nudge the user to narrow it.
 */
export async function listInterviewsSchedule(filters: InterviewListFilters) {
  const db = await getScopedPrisma();
  const where = buildInterviewWhere(filters);

  const total = await db.interviewRound.count({ where });
  const rows = await db.interviewRound.findMany({
    where,
    orderBy: [{ scheduledAt: "desc" }, { id: "asc" }],
    take: SCHEDULE_CAP,
    select: INTERVIEW_LIST_SELECT,
  });

  return { rows, total, capped: total > SCHEDULE_CAP };
}
