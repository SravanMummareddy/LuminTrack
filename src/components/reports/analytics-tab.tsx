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
import { SUBMISSION_STATUS_LABEL, JOB_SOURCE_TYPE_LABEL } from "@/lib/labels";
import type { SourceStatRow } from "@/lib/analytics";

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

/** V-5: an avg-days value (or null when there's nothing to average). */
function fmtDays(value: number | null): string {
  return value == null ? "—" : `${value} day${value === 1 ? "" : "s"}`;
}

/** SRC-2: a channel scoreboard table — jobs → submissions → placements → fill. */
function SourceStatTable({
  rows,
  labelFor,
  firstHeader,
  emptyLabel,
}: {
  rows: SourceStatRow[];
  labelFor: (key: string) => string;
  firstHeader: string;
  emptyLabel: string;
}) {
  if (rows.length === 0)
    return (
      <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
        {emptyLabel}
      </p>
    );
  return (
    <Table>
      <thead>
        <tr>
          <Th>{firstHeader}</Th>
          <Th className="text-right">Jobs</Th>
          <Th className="text-right">Submissions</Th>
          <Th className="text-right">Placements</Th>
          <Th className="text-right">Fill rate</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="hover:bg-slate-50">
            <Td label={firstHeader} className="font-medium text-slate-800">
              {labelFor(r.key)}
            </Td>
            <Td label="Jobs" className="text-right tabular-nums">
              {r.jobs}
            </Td>
            <Td label="Submissions" className="text-right tabular-nums">
              {r.submissions}
            </Td>
            <Td label="Placements" className="text-right tabular-nums">
              {r.placements}
            </Td>
            <Td label="Fill rate" className="text-right font-medium tabular-nums">
              {pct(r.fillRate)}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
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
      <Th className="text-right">Avg time to submit</Th>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        {/* V-5: avg time-to-submit, measured from each job's received date. */}
        <ConversionCard
          label="Avg time to submit"
          value={fmtDays(conversions.avgTimeToSubmit)}
          detail={`across ${conversions.jobsWithSubmission} job${
            conversions.jobsWithSubmission === 1 ? "" : "s"
          } with a submission · from received date`}
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
              <Td label="Avg time to submit" className="text-right tabular-nums">
                {fmtDays(r.avgTimeToSubmit)}
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

      {/* SRC-2: which channels bring jobs that convert. */}
      <Card
        title="By source"
        description="Jobs and their outcomes grouped by where the requisition came from. Fill rate = placements ÷ jobs."
      >
        <SourceStatTable
          rows={data.bySource}
          labelFor={(k) => JOB_SOURCE_TYPE_LABEL[k] ?? k}
          firstHeader="Source"
          emptyLabel="No jobs match the selected filters."
        />
      </Card>

      <Card
        title="By job board"
        description="Job-board sources split by the specific board — which subscription actually returns placements."
      >
        <SourceStatTable
          rows={data.byJobBoard}
          labelFor={(k) => k}
          firstHeader="Board"
          emptyLabel="No job-board jobs match the selected filters."
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

    </>
  );
}
