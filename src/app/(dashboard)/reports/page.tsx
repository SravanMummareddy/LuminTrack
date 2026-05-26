import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { CollapsibleTable } from "@/components/reports/collapsible-table";
import { Pagination } from "@/components/ui/pagination";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { BarChartCard } from "@/components/dashboard/charts";
import { getReportsData, type ReportsData } from "@/server/queries/reports";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import {
  parseAnalyticsParams,
  TONE_HEX,
  AGING_BUCKET_LABEL,
  AGING_BUCKET_TONE,
} from "@/lib/analytics";
import { parsePage } from "@/lib/filters";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";

const REPORTS_PAGE_SIZE = 10;

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

const dimensionHead = (
  <thead className="border-b border-slate-200 bg-slate-50">
    <tr>
      <Th>Name</Th>
      <Th className="text-right">Jobs</Th>
      <Th className="text-right">Submissions</Th>
      <Th className="text-right">Interviews</Th>
      <Th className="text-right">Selected</Th>
      <Th className="text-right">Joined</Th>
      <Th className="text-right">Joined %</Th>
    </tr>
  </thead>
);

function renderDimensionRow(r: ReportsData["byClient"][number]) {
  const conv = r.submissions
    ? `${Math.round((r.joined / r.submissions) * 100)}%`
    : "—";
  return (
    <>
      <Td label="Name" className="font-medium text-slate-800">
        {r.name}
      </Td>
      <Td label="Jobs" className="text-right tabular-nums">
        {r.jobs}
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
      <Td label="Joined %" className="text-right tabular-nums">
        {conv}
      </Td>
    </>
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);
  const ojobsPage = parsePage(Array.isArray(sp.ojobs) ? sp.ojobs[0] : sp.ojobs);
  const ragingPage = parsePage(
    Array.isArray(sp.raging) ? sp.raging[0] : sp.raging,
  );

  const [data, clients, vendors, sources, recruiters] = await Promise.all([
    getReportsData(filters, {
      openJobs: ojobsPage,
      recruiterAging: ragingPage,
    }),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

  const pipelineChart = data.pipeline.map((d) => ({
    label: SUBMISSION_STATUS_LABEL[d.status],
    value: d.count,
    color: TONE_HEX[SUBMISSION_STATUS_TONE[d.status]],
  }));

  const { conversions } = data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Reports & Analytics"
        description="Management analysis across jobs, submissions, recruiters, and outcomes."
      />

      <AnalyticsFilters
        current={current}
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

      <Card
        title="Candidate pipeline by stage"
        description="Submissions grouped by their current pipeline status."
      >
        <BarChartCard data={pipelineChart} height={300} />
      </Card>

      <Card title="Performance by client">
        <CollapsibleTable
          rows={data.byClient}
          head={dimensionHead}
          rowKey={(r) => r.name}
          renderRow={renderDimensionRow}
        />
      </Card>

      <Card title="Performance by vendor">
        <CollapsibleTable
          rows={data.byVendor}
          head={dimensionHead}
          rowKey={(r) => r.name}
          renderRow={renderDimensionRow}
        />
      </Card>

      <Card title="Performance by source">
        <CollapsibleTable
          rows={data.bySource}
          head={dimensionHead}
          rowKey={(r) => r.name}
          renderRow={renderDimensionRow}
        />
      </Card>

      <Card title="Performance by recruiter">
        <CollapsibleTable
          rows={data.byRecruiter}
          head={
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Recruiter</Th>
                <Th className="text-right">Submissions</Th>
                <Th className="text-right">Interviews</Th>
                <Th className="text-right">Selected</Th>
                <Th className="text-right">Joined</Th>
              </tr>
            </thead>
          }
          rowKey={(r) => r.name}
          renderRow={(r) => (
            <>
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
            </>
          )}
          emptyState={
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No recruiter submissions for the selected filters.
            </p>
          }
        />
      </Card>

      <Card
        title="Open-job aging report"
        description="Open and On Hold jobs by days since creation. Bucket counts reflect every open job; the table below paginates."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.agingBuckets.map((b) => (
            <div
              key={b.bucket}
              className="rounded-md border border-slate-200 p-3 text-center"
            >
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {b.count}
              </div>
              <div className="mt-1">
                <Badge tone={AGING_BUCKET_TONE[b.bucket]}>
                  {AGING_BUCKET_LABEL[b.bucket]}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {data.openJobs.total > 0 && (
          <div className="mt-4 space-y-3">
            <Table>
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <Th>Job</Th>
                  <Th>Client</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Days open</Th>
                  <Th>Aging</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.openJobs.rows.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <Td label="Job">
                      <Link
                        href={`/jobs/${j.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {j.title}
                      </Link>
                    </Td>
                    <Td label="Client">{j.client}</Td>
                    <Td label="Status">
                      <Badge tone={JOB_STATUS_TONE[j.status]}>
                        {JOB_STATUS_LABEL[j.status]}
                      </Badge>
                    </Td>
                    <Td label="Days open" className="text-right tabular-nums">
                      {j.days}
                    </Td>
                    <Td label="Aging">
                      <Badge tone={AGING_BUCKET_TONE[j.bucket]}>
                        {AGING_BUCKET_LABEL[j.bucket]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={data.openJobs.page}
              total={data.openJobs.total}
              totalPages={data.openJobs.totalPages}
              paramKey="ojobs"
              pageSize={REPORTS_PAGE_SIZE}
            />
          </div>
        )}
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
        title="Client revenue projection"
        description="OPEN + ON_HOLD jobs only. Σ candidateRate × 8h × duration × positions. Duration = startDate→endDate when both are set; otherwise a conservative 90-day default."
      >
        <CollapsibleTable
          rows={data.clientRevenue}
          head={
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Client</Th>
                <Th className="text-right">Active jobs</Th>
                <Th className="text-right">Projected revenue</Th>
              </tr>
            </thead>
          }
          rowKey={(r) => r.client}
          renderRow={(r) => (
            <>
              <Td label="Client" className="font-medium text-slate-800">
                {r.client}
              </Td>
              <Td label="Active jobs" className="text-right tabular-nums">
                {r.jobs}
              </Td>
              <Td label="Projected revenue" className="text-right tabular-nums">
                {r.projected.toLocaleString(undefined, {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                })}
              </Td>
            </>
          )}
          emptyState={
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
              No open jobs with a candidate rate.
            </p>
          }
        />
      </Card>

      <Card
        title="Time to fill"
        description="Days from job creation to a JOINED submission. Median + p90 — robust to one stuck job dragging the mean. Dimensions with fewer than 3 fills show — (not enough data)."
      >
        {data.timeToFill.overall.filled === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No filled submissions in the selected range yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Filled (overall)"
                value={String(data.timeToFill.overall.filled)}
              />
              <StatTile
                label="Median days"
                value={fmtDays(data.timeToFill.overall.median)}
              />
              <StatTile
                label="p90 days"
                value={fmtDays(data.timeToFill.overall.p90)}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <FillDimensionTable
                title="By client"
                rows={data.timeToFill.byClient}
              />
              <FillDimensionTable
                title="By source"
                rows={data.timeToFill.bySource}
              />
            </div>
          </>
        )}
      </Card>

      <Card
        title="Time in stage"
        description="Median + p90 days submissions sit in each pipeline stage before moving. Terminal states (Rejected / On Hold / Joined) excluded. Ongoing counts how many samples are still sitting in that stage right now."
      >
        {data.timeInStage.every((r) => r.n === 0) ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No status history for submissions in the selected range.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Stage</Th>
                <Th className="text-right">Samples</Th>
                <Th className="text-right">Ongoing</Th>
                <Th className="text-right">Median days</Th>
                <Th className="text-right">p90 days</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.timeInStage.map((r) => (
                <tr key={r.status} className="hover:bg-slate-50">
                  <Td label="Stage" className="font-medium text-slate-800">
                    {SUBMISSION_STATUS_LABEL[r.status]}
                  </Td>
                  <Td label="Samples" className="text-right tabular-nums">
                    {r.n}
                  </Td>
                  <Td label="Ongoing" className="text-right tabular-nums text-slate-500">
                    {r.ongoing}
                  </Td>
                  <Td label="Median days" className="text-right tabular-nums">
                    {fmtDays(r.median)}
                  </Td>
                  <Td label="p90 days" className="text-right tabular-nums">
                    {fmtDays(r.p90)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
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

function fmtDays(n: number | null): string {
  return n == null ? "—" : String(n);
}

function FillDimensionTable({
  title,
  rows,
}: {
  title: string;
  rows: ReportsData["timeToFill"]["byClient"];
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <CollapsibleTable
        rows={rows}
        defaultLimit={10}
        head={
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th className="text-right">Filled</Th>
              <Th className="text-right">Median</Th>
              <Th className="text-right">p90</Th>
            </tr>
          </thead>
        }
        rowKey={(r) => r.name}
        renderRow={(r) => (
          <>
            <Td label="Name" className="font-medium text-slate-800">
              {r.name}
            </Td>
            <Td label="Filled" className="text-right tabular-nums">
              {r.filled}
            </Td>
            <Td label="Median" className="text-right tabular-nums">
              {fmtDays(r.median)}
            </Td>
            <Td label="p90" className="text-right tabular-nums">
              {fmtDays(r.p90)}
            </Td>
          </>
        )}
        emptyState={
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-400">
            No data.
          </p>
        }
      />
    </div>
  );
}
