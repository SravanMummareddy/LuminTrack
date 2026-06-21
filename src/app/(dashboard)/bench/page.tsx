import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button";
import { BenchRosterTable } from "@/components/bench/bench-roster-table";
import { BenchFilters } from "@/components/bench/bench-filters";
import {
  listBenchConsultants,
  BENCH_SORT_KEYS,
  BENCH_DEFAULT_SORT,
  type BenchListFilters,
} from "@/server/queries/bench-consultants";
import { listActiveRecruiterOptions } from "@/server/queries/org";
import { parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import { BENCH_PRIORITIES, BENCH_MARKETING_STATUSES } from "@/lib/labels";
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

      <BenchFilters current={current} recruiters={recruiters} />

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
