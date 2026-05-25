import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
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
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";

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

/** A client / vendor / source performance breakdown table. */
function DimensionTable({ rows }: { rows: ReportsData["byClient"] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
        No data for the selected filters.
      </p>
    );
  }
  return (
    <Table>
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
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => {
          // Per-dimension conversion: joined / submissions. Lets a manager
          // compare iLabor vs manual sources (or one client vs another)
          // without doing the math by hand.
          const conv = r.submissions
            ? `${Math.round((r.joined / r.submissions) * 100)}%`
            : "—";
          return (
            <tr key={r.name} className="hover:bg-slate-50">
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
            </tr>
          );
        })}
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);

  const [data, clients, vendors, sources, recruiters] = await Promise.all([
    getReportsData(filters),
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
        <DimensionTable rows={data.byClient} />
      </Card>

      <Card title="Performance by vendor">
        <DimensionTable rows={data.byVendor} />
      </Card>

      <Card title="Performance by source">
        <DimensionTable rows={data.bySource} />
      </Card>

      <Card title="Performance by recruiter">
        {data.byRecruiter.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No recruiter submissions for the selected filters.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Recruiter</Th>
                <Th className="text-right">Submissions</Th>
                <Th className="text-right">Interviews</Th>
                <Th className="text-right">Selected</Th>
                <Th className="text-right">Joined</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.byRecruiter.map((r) => (
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
            </tbody>
          </Table>
        )}
      </Card>

      <Card
        title="Open-job aging report"
        description="Open and On Hold jobs by days since creation."
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

        {data.openJobs.length > 0 && (
          <div className="mt-4">
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
                {data.openJobs.map((j) => (
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
          </div>
        )}
      </Card>
    </div>
  );
}
