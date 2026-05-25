import Link from "next/link";
import {
  Briefcase,
  Send,
  CalendarCheck,
  CircleCheck,
  FileText,
  UserCheck,
  CircleX,
  CirclePause,
} from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDashboardData } from "@/server/queries/dashboard";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseAnalyticsParams, TONE_HEX, AGING_BUCKET_LABEL, AGING_BUCKET_TONE } from "@/lib/analytics";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartCard, DonutChartCard } from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, cardLink } from "@/components/ui/table";

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white p-5 ${className ?? ""}`}
    >
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);

  const [user, data, clients, vendors, sources, recruiters] = await Promise.all(
    [
      getCurrentUser(),
      getDashboardData(filters),
      listClients(),
      listVendors(),
      listSisterCompanies(),
      listUsers(),
    ],
  );

  const jobsByStatusChart = data.jobsByStatus.map((d) => ({
    label: JOB_STATUS_LABEL[d.status],
    value: d.count,
    color: TONE_HEX[JOB_STATUS_TONE[d.status]],
  }));

  const submissionsByStageChart = data.submissionsByStatus.map((d) => ({
    label: SUBMISSION_STATUS_LABEL[d.status],
    value: d.count,
    color: TONE_HEX[SUBMISSION_STATUS_TONE[d.status]],
  }));

  // Long tail of sources crushes the bar chart — keep the top 5 distinct and
  // roll the remainder into a single "Other" bar. `data.jobsBySource` is
  // already sorted desc by count.
  const TOP_SOURCES = 5;
  const topSources = data.jobsBySource.slice(0, TOP_SOURCES);
  const restCount = data.jobsBySource
    .slice(TOP_SOURCES)
    .reduce((sum, d) => sum + d.count, 0);
  const jobsBySourceChart = [
    ...topSources.map((d) => ({ label: d.name, value: d.count })),
    ...(restCount > 0 ? [{ label: "Other", value: restCount }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome back{user ? `, ${user.fullName}` : ""}. Recruiting overview
          across the selected filters.
        </p>
      </div>

      <AnalyticsFilters
        current={current}
        basePath="/"
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active jobs"
          value={data.activeJobs}
          icon={Briefcase}
          tone="green"
          hint={`${data.openJobs} open · ${data.onHoldJobs} on hold`}
          tooltip="Counts only OPEN/ON_HOLD jobs with at least one assigned recruiter. Unowned bulk-imported jobs are excluded. Honors the filters above."
        />
        <StatCard
          label="Total submissions"
          value={data.totalSubmissions}
          icon={Send}
          tone="indigo"
          tooltip="All submissions in the filter window, regardless of status."
        />
        <StatCard
          label="Interviews"
          value={data.interviewCount}
          icon={CalendarCheck}
          tone="blue"
          tooltip="Total interview rounds across all in-window submissions."
        />
        <StatCard
          label="Selected"
          value={data.selected}
          icon={CircleCheck}
          tone="green"
          tooltip="Submissions whose current status is Selected."
        />
        <StatCard
          label="Offers released"
          value={data.offerReleased}
          icon={FileText}
          tone="indigo"
          tooltip="Submissions whose current status is Offer Released."
        />
        <StatCard
          label="Joined"
          value={data.joined}
          icon={UserCheck}
          tone="green"
          tooltip="Submissions whose current status is Joined."
        />
        <StatCard
          label="Rejected"
          value={data.rejected}
          icon={CircleX}
          tone="red"
          tooltip="Submissions whose current status is Rejected."
        />
        <StatCard
          label="On hold"
          value={data.onHold}
          icon={CirclePause}
          tone="amber"
          tooltip="Submissions whose current status is On Hold."
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Jobs by status">
          {data.totalJobs === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              No jobs for the selected filters.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="w-full sm:w-1/2">
                <DonutChartCard data={jobsByStatusChart} />
              </div>
              <ul className="w-full space-y-1.5 sm:w-1/2">
                {data.jobsByStatus.map((d) => (
                  <li
                    key={d.status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2 text-slate-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: TONE_HEX[JOB_STATUS_TONE[d.status]],
                        }}
                      />
                      {JOB_STATUS_LABEL[d.status]}
                    </span>
                    <span className="font-medium tabular-nums text-slate-900">
                      {d.count}
                    </span>
                  </li>
                ))}
                <li className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
                  <span className="text-slate-500">Total jobs</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {data.totalJobs}
                  </span>
                </li>
              </ul>
            </div>
          )}
        </Card>

        <Card title="Jobs by source">
          <BarChartCard data={jobsBySourceChart} />
        </Card>
      </div>

      <Card title="Submissions by pipeline stage">
        <BarChartCard data={submissionsByStageChart} height={320} />
      </Card>

      <Card title="Open-job aging">
        <p className="-mt-2 mb-3 text-xs text-slate-400">
          Days since creation for Open and On Hold jobs.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.aging.map((a) => (
            <div
              key={a.bucket}
              className="rounded-md border border-slate-200 p-3 text-center"
            >
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {a.count}
              </div>
              <div className="mt-1">
                <Badge tone={AGING_BUCKET_TONE[a.bucket]}>
                  {AGING_BUCKET_LABEL[a.bucket]}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recruiter performance">
        {data.recruiterPerf.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
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
              {data.recruiterPerf.map((r) => {
                const dash = (n: number) =>
                  n === 0 ? <span className="text-slate-300">—</span> : n;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td heading>
                      <Link
                        href={`/recruiters/${r.id}`}
                        className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                      >
                        {r.fullName}
                      </Link>
                    </Td>
                    <Td label="Submissions" className="text-right tabular-nums">
                      {dash(r.submissions)}
                    </Td>
                    <Td
                      label="Interviews"
                      secondary
                      className="text-right tabular-nums"
                    >
                      {dash(r.interviews)}
                    </Td>
                    <Td
                      label="Selected"
                      secondary
                      className="text-right tabular-nums"
                    >
                      {dash(r.selected)}
                    </Td>
                    <Td label="Joined" className="text-right tabular-nums">
                      {dash(r.joined)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
