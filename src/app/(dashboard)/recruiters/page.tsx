import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Pagination } from "@/components/ui/pagination";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import {
  listRecruiterPerformance,
  RECRUITER_SORT_KEYS,
  RECRUITER_DEFAULT_SORT,
} from "@/server/queries/recruiters";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseAnalyticsParams, firstParam } from "@/lib/analytics";
import { parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";

export default async function RecruitersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);

  const sort = parseSort(
    firstParam(sp.sort),
    firstParam(sp.dir),
    RECRUITER_SORT_KEYS,
    RECRUITER_DEFAULT_SORT,
  );
  const page = parsePage(firstParam(sp.page));

  const [perf, clients, vendors, sources, recruiters] = await Promise.all([
    listRecruiterPerformance(filters, { sort, page }),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

  const { rows, total } = perf;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Recruiters"
        description="Performance counts for every active recruiter. Open a recruiter for their full activity."
      />

      <AnalyticsFilters
        current={current}
        basePath="/recruiters"
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
        showStatusFilters={false}
      />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">No active recruiters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <SortableHeader column="name" label="Recruiter" />
                <SortableHeader
                  column="jobs"
                  label="Jobs assigned"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="submissions"
                  label="Submissions"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="interviews"
                  label="Interviews"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="selected"
                  label="Selected"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="offers"
                  label="Offers"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="joined"
                  label="Joined"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="rejected"
                  label="Rejected"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="onhold"
                  label="On hold"
                  align="right"
                  defaultDir="desc"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/recruiters/${r.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {r.fullName}
                    </Link>
                    {r.role === "ADMIN" && (
                      <Badge tone="slate" className="ml-2">
                        Admin
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{r.jobsAssigned}</Td>
                  <Td className="text-right tabular-nums font-medium text-slate-900">
                    {r.submissions}
                  </Td>
                  <Td className="text-right tabular-nums">{r.interviews}</Td>
                  <Td className="text-right tabular-nums">{r.selected}</Td>
                  <Td className="text-right tabular-nums">{r.offerReleased}</Td>
                  <Td className="text-right tabular-nums">{r.joined}</Td>
                  <Td className="text-right tabular-nums">{r.rejected}</Td>
                  <Td className="text-right tabular-nums">{r.onHold}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={perf.page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
