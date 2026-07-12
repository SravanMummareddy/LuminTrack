import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { InterviewsTable } from "@/components/interviews/interviews-table";
import { InterviewsFilters } from "@/components/interviews/interviews-filters";
import { InterviewSchedule } from "@/components/interviews/interview-schedule";
import { InterviewViewToggle } from "@/components/interviews/interview-view-toggle";
import {
  listInterviews,
  listInterviewsSchedule,
  INTERVIEW_SORT_KEYS,
  INTERVIEW_DEFAULT_SORT,
  type InterviewListFilters,
} from "@/server/queries/interviews";
import { listActiveRecruiterOptions } from "@/server/queries/org";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import {
  parseSort,
  parsePage,
  parseDateRange,
  parseList,
  parseEnumList,
  PAGE_SIZE,
} from "@/lib/filters";
import {
  INTERVIEW_RESULTS,
  INTERVIEW_TYPES,
  DISCIPLINES,
} from "@/lib/labels";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const current = {
    q: clean(sp.q),
    recruiterId: parseList(sp.recruiterId),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    INTERVIEW_SORT_KEYS,
    INTERVIEW_DEFAULT_SORT,
  );

  const filters: InterviewListFilters = {
    q: current.q,
    recruiterId: current.recruiterId,
    results: parseEnumList(parseList(sp.result), INTERVIEW_RESULTS),
    interviewTypes: parseEnumList(parseList(sp.roundType), INTERVIEW_TYPES),
    disciplines: parseEnumList(parseList(sp.discipline), DISCIPLINES),
    scheduledRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
  };

  const view = clean(sp.view) === "schedule" ? "schedule" : "list";

  const [schedule, list, recruiters, user] = await Promise.all([
    view === "schedule" ? listInterviewsSchedule(filters) : null,
    view === "list" ? listInterviews(filters) : null,
    listActiveRecruiterOptions(),
    getCurrentUser(),
  ]);
  const isManager = isManagerTier(user);

  const total = view === "schedule" ? schedule!.total : list!.total;

  const emptyState = (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm text-slate-500">
        No scheduled interviews match these filters. Interviews appear here once a round has a scheduled date.
      </p>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Interviews"
        description="Every scheduled interview round across all submissions. Read-only — manage rounds on each submission."
      />

      <InterviewViewToggle currentView={view} searchParams={sp} />

      <InterviewsFilters recruiters={recruiters} />

      {total === 0 ? (
        emptyState
      ) : view === "schedule" ? (
        <InterviewSchedule
          rows={schedule!.rows}
          now={new Date()}
          capped={schedule!.capped}
          isManager={isManager}
        />
      ) : (
        <div className="space-y-3">
          <InterviewsTable
            rows={list!.rows}
            pageOffset={(list!.page - 1) * PAGE_SIZE}
            countLabel={`${total} interview${total === 1 ? "" : "s"}`}
            isManager={isManager}
          />
          <Pagination
            page={list!.page}
            totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
          />
        </div>
      )}
    </div>
  );
}
