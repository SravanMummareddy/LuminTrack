import Link from "next/link";
import { Table, Th, Td } from "@/components/ui/table";
import { CollapsibleTable } from "@/components/reports/collapsible-table";
import { Pagination } from "@/components/ui/pagination";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { getReportsData } from "@/server/queries/reports";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseAnalyticsParams } from "@/lib/analytics";
import { parsePage } from "@/lib/filters";
import { SUBMISSION_STATUS_LABEL } from "@/lib/labels";

const REPORTS_PAGE_SIZE = 10;

type SearchParams = { [key: string]: string | string[] | undefined };

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {description && (
        <p className="mt-0.5 mb-3 text-xs text-slate-400">{description}</p>
      )}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ConversionCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 text-center">
      <div className="text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

/**
 * The Reports body — the recruiter-focused analytics cards plus the filter
 * bar. Lives in its own component so the Reports page can route between this
 * and the Monthly Performance tab via `?tab=`. Analytics is the default (no
 * `?tab=`), so its filter/pagination links keep working unchanged.
 */
export async function AnalyticsTab({
  searchParams: sp,
}: {
  searchParams: SearchParams;
}) {
  const { filters } = parseAnalyticsParams(sp);
  const ragingPage = parsePage(
    Array.isArray(sp.raging) ? sp.raging[0] : sp.raging,
  );

  const [data, clients, vendors, sources, recruiters] = await Promise.all([
    getReportsData(filters, { recruiterAging: ragingPage }),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

  const { conversions } = data;

  const recruiterHead = (
    <tr>
      <Th>Recruiter</Th>
      <Th className="text-right">Submissions</Th>
      <Th className="text-right">Interviews</Th>
      <Th className="text-right">Selected</Th>
      <Th className="text-right">Joined</Th>
    </tr>
  );

  return (
    <>
      <AnalyticsFilters
        basePath="/reports"
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ConversionCard
          label="Submission → Interview"
          value={pct(conversions.submissionToInterview)}
          detail={`${conversions.interviewed} of ${conversions.totalSubmissions} submissions reached an interview`}
        />
        <ConversionCard
          label="Interview → Selection"
          value={pct(conversions.interviewToSelection)}
          detail={`${conversions.selectedAfterInterview} of ${conversions.interviewed} interviewed candidates were selected or beyond`}
        />
      </div>

      <Card title="Performance by recruiter">
        <CollapsibleTable
          head={recruiterHead}
          rows={data.byRecruiter.map((r) => (
            <tr key={r.name} className="hover:bg-slate-50">
              <Td label="Recruiter" className="font-medium text-slate-800">
                {r.name}
              </Td>
              <Td label="Submissions" className="text-right tabular-nums">
                {r.submissions}
              </Td>
              <Td label="Interviews" className="text-right tabular-nums">
                {r.interviews}
              </Td>
              <Td label="Selected" className="text-right tabular-nums">
                {r.selected}
              </Td>
              <Td label="Joined" className="text-right tabular-nums">
                {r.joined}
              </Td>
            </tr>
          ))}
          emptyState={
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No recruiter submissions for the selected filters.
            </p>
          }
        />
      </Card>

      <Card
        title="Recruiter aging — stale submissions"
        description="Submissions older than 14 days still in early pipeline stages (Submitted / Resume Picked / Vendor Screening / Client Interview)."
      >
        {data.recruiterAging.total === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No stale submissions — nice work.
          </p>
        ) : (
          <div className="space-y-3">
            <Table>
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>Submission</Th>
                  <Th>Recruiter</Th>
                  <Th>Candidate</Th>
                  <Th>Job · Client</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Days idle</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recruiterAging.rows.map((s) => (
                  <tr key={s.submissionId} className="hover:bg-slate-50">
                    <Td label="Submission">
                      <Link
                        href={`/submissions/${s.submissionId}`}
                        className="font-mono text-xs text-indigo-600 hover:underline"
                      >
                        SUB-{String(s.seq).padStart(3, "0")}
                      </Link>
                    </Td>
                    <Td label="Recruiter">{s.recruiter}</Td>
                    <Td label="Candidate">{s.candidate}</Td>
                    <Td label="Job · Client">
                      {s.job}
                      <span className="ml-1 text-xs text-slate-500">
                        · {s.client}
                      </span>
                    </Td>
                    <Td label="Status">
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Td>
                    <Td label="Days idle" className="text-right tabular-nums">
                      {s.days}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={data.recruiterAging.page}
              total={data.recruiterAging.total}
              totalPages={data.recruiterAging.totalPages}
              paramKey="raging"
              pageSize={REPORTS_PAGE_SIZE}
            />
          </div>
        )}
      </Card>

      <Card
        title="Active placements + projected margin"
        description="ACTIVE + EXTENDED placements only. Σ (bill − pay) × 8h × remaining-days. Open-ended placements default to a 90-day window. Negative margins surface as red."
      >
        {data.placementMargin.totalActive === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No active placements yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Active placements"
                value={String(data.placementMargin.totalActive)}
              />
              <StatTile
                label="Projected margin"
                value={data.placementMargin.totalMargin.toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                })}
              />
              <StatTile
                label="Negative-margin rows"
                value={String(data.placementMargin.negativeCount)}
              />
            </div>
            <div className="mt-5">
              <CollapsibleTable
                head={
                  <tr>
                    <Th>Client</Th>
                    <Th className="text-right">Active</Th>
                    <Th className="text-right">Projected margin</Th>
                    <Th className="text-right">Negative</Th>
                  </tr>
                }
                rows={data.placementMargin.byClient.map((r) => (
                  <tr key={r.client} className="hover:bg-slate-50">
                    <Td label="Client" className="font-medium text-slate-800">
                      {r.client}
                    </Td>
                    <Td label="Active" className="text-right tabular-nums">
                      {r.active}
                    </Td>
                    <Td
                      label="Projected margin"
                      className={`text-right tabular-nums ${r.margin < 0 ? "text-red-600" : ""}`}
                    >
                      {r.margin.toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      })}
                    </Td>
                    <Td label="Negative" className="text-right tabular-nums">
                      {r.negative > 0 ? (
                        <span className="text-red-600">{r.negative}</span>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
                emptyState={null}
              />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
