import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button";
import { BenchRosterTable } from "@/components/bench/bench-roster-table";
import {
  listBenchConsultants,
  BENCH_SORT_KEYS,
  BENCH_DEFAULT_SORT,
  type BenchListFilters,
} from "@/server/queries/bench-consultants";
import { listActiveRecruiterOptions } from "@/server/queries/org";
import { parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import {
  BENCH_PRIORITIES,
  BENCH_PRIORITY_LABEL,
  BENCH_MARKETING_STATUSES,
  BENCH_MARKETING_STATUS_LABEL,
} from "@/lib/labels";
import type {
  BenchPriority,
  BenchMarketingStatus,
} from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function BenchRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // Status modes: absent → "onbench" (default, ACTIVE/PAUSED); "all" → every
  // status; or a specific marketing status. Lets the roster default to "who
  // we're marketing now" while keeping placed/inactive one click away.
  const statusMode = clean(sp.status) ?? "onbench";
  const current = {
    q: clean(sp.q),
    priority: clean(sp.priority),
    status: statusMode,
    recruiterId: clean(sp.recruiterId),
  };

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    BENCH_SORT_KEYS,
    BENCH_DEFAULT_SORT,
  );

  const filters: BenchListFilters = {
    q: current.q,
    priority: (BENCH_PRIORITIES as string[]).includes(current.priority ?? "")
      ? (current.priority as BenchPriority)
      : undefined,
    marketingStatus: (BENCH_MARKETING_STATUSES as string[]).includes(statusMode)
      ? (statusMode as BenchMarketingStatus)
      : undefined,
    onBench: statusMode === "onbench",
    recruiterId: current.recruiterId,
    sort,
    page: parsePage(clean(sp.page)),
  };

  const [{ rows, total, page }, recruiters] = await Promise.all([
    listBenchConsultants(filters),
    listActiveRecruiterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bench"
        description="Roster of consultants being marketed out to vendors."
      >
        <Link href="/bench/new" className={buttonClass()}>
          Add consultant
        </Link>
      </PageHeader>

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Name, technology, location"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Priority</span>
          <select name="priority" defaultValue={current.priority ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            {BENCH_PRIORITIES.map((p) => (
              <option key={p} value={p}>{BENCH_PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Marketing status</span>
          <select name="status" defaultValue={statusMode} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="onbench">On bench (Active + Paused)</option>
            <option value="all">All</option>
            {BENCH_MARKETING_STATUSES.map((s) => (
              <option key={s} value={s}>{BENCH_MARKETING_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Recruiter</span>
          <select name="recruiterId" defaultValue={current.recruiterId ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            {recruiters.map((r) => (
              <option key={r.id} value={r.id}>{r.fullName}</option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-4 flex justify-end gap-2">
          <Link href="/bench" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
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
            No bench consultants yet. Add one to start marketing them out to vendors.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} consultant{total === 1 ? "" : "s"}
          </p>
          <BenchRosterTable
            rows={rows}
            pageOffset={(page - 1) * PAGE_SIZE}
            groupByPriority={sort.key === "priority"}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
