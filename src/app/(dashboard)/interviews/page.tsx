import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { InterviewsTable } from "@/components/interviews/interviews-table";
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
    scheduledRange: parseDateRange({ from: current.from, to: current.to }),
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

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Candidate, job, or client"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Interview from</span>
          <input
            type="date"
            name="from"
            defaultValue={current.from ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Interview to</span>
          <input
            type="date"
            name="to"
            defaultValue={current.to ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-xs font-medium text-slate-600">Sales recruiter</span>
          <select
            name="recruiterId"
            defaultValue={current.recruiterId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            {recruiters.map((r) => (
              <option key={r.id} value={r.id}>{r.fullName}</option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-3 flex justify-end gap-2">
          <Link href="/interviews" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
            Reset
          </Link>
          <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            Apply
          </button>
        </div>
      </form>

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
