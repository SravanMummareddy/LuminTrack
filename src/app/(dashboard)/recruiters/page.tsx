import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
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
          <MobileSort
            options={[
              { column: "name", label: "Recruiter" },
              { column: "jobs", label: "Jobs assigned", defaultDir: "desc" },
              { column: "submissions", label: "Submissions", defaultDir: "desc" },
              { column: "interviews", label: "Interviews", defaultDir: "desc" },
              { column: "selected", label: "Selected", defaultDir: "desc" },
              { column: "offers", label: "Offers", defaultDir: "desc" },
              { column: "joined", label: "Joined", defaultDir: "desc" },
              { column: "rejected", label: "Rejected", defaultDir: "desc" },
              { column: "onhold", label: "On hold", defaultDir: "desc" },
            ]}
          />
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
                  <Td label="Recruiter">
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
                  <Td label="Jobs assigned" className="text-right tabular-nums">
                    {r.jobsAssigned}
                  </Td>
                  <Td
                    label="Submissions"
                    className="text-right tabular-nums font-medium text-slate-900"
                  >
                    {r.submissions}
                  </Td>
                  <Td label="Interviews" className="text-right tabular-nums">
                    {r.interviews}
                  </Td>
                  <Td label="Selected" className="text-right tabular-nums">
                    {r.selected}
                  </Td>
                  <Td label="Offers" className="text-right tabular-nums">
                    {r.offerReleased}
                  </Td>
                  <Td label="Joined" className="text-right tabular-nums">
                    {r.joined}
                  </Td>
                  <Td label="Rejected" className="text-right tabular-nums">
                    {r.rejected}
                  </Td>
                  <Td label="On hold" className="text-right tabular-nums">
                    {r.onHold}
                  </Td>
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
