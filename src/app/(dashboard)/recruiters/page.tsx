import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { listRecruiterPerformance } from "@/server/queries/recruiters";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseAnalyticsParams } from "@/lib/analytics";

export default async function RecruitersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);

  const [rows, clients, vendors, sources, recruiters] = await Promise.all([
    listRecruiterPerformance(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">No active recruiters.</p>
        </div>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Recruiter</Th>
              <Th className="text-right">Jobs assigned</Th>
              <Th className="text-right">Submissions</Th>
              <Th className="text-right">Interviews</Th>
              <Th className="text-right">Selected</Th>
              <Th className="text-right">Offers</Th>
              <Th className="text-right">Joined</Th>
              <Th className="text-right">Rejected</Th>
              <Th className="text-right">On hold</Th>
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
      )}
    </div>
  );
}
