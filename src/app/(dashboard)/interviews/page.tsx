import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { InterviewsTable } from "@/components/interviews/interviews-table";
import { InterviewsFilters } from "@/components/interviews/interviews-filters";
import {
  listInterviews,
  INTERVIEW_SORT_KEYS,
  INTERVIEW_DEFAULT_SORT,
  type InterviewListFilters,
} from "@/server/queries/interviews";
import { listActiveRecruiterOptions } from "@/server/queries/org";
import { parseSort, parsePage, parseDateRange, PAGE_SIZE } from "@/lib/filters";

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
    recruiterId: clean(sp.recruiterId),
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
    scheduledRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
  };

  const [{ rows, total, page }, recruiters] = await Promise.all([
    listInterviews(filters),
    listActiveRecruiterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Interviews"
        description="Every scheduled interview round across all submissions. Read-only — manage rounds on each submission."
      />

      <InterviewsFilters current={current} recruiters={recruiters} />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No scheduled interviews match these filters. Interviews appear here once a round has a scheduled date.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} interview{total === 1 ? "" : "s"}
          </p>
          <InterviewsTable rows={rows} pageOffset={(page - 1) * PAGE_SIZE} />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
