import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Send,
  CalendarCheck,
  CircleCheck,
  FileText,
  UserCheck,
  CircleX,
  CirclePause,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { StatCard } from "@/components/dashboard/stat-card";
import { BarChartCard } from "@/components/dashboard/charts";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { getRecruiterDetail } from "@/server/queries/recruiters";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseAnalyticsParams } from "@/lib/analytics";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";
import { formatDate } from "@/lib/format";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

export default async function RecruiterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);

  const [detail, clients, vendors, sources, recruiters] = await Promise.all([
    getRecruiterDetail(id, filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);
  if (!detail) notFound();

  const { user, stats, jobsAssigned, assignments, submissions, monthly, activity } =
    detail;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/recruiters"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to recruiters
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {user.fullName}
            </h1>
            <Badge tone={user.role === "ADMIN" ? "indigo" : "slate"}>
              {user.role === "ADMIN" ? "Administrator" : "Recruiter"}
            </Badge>
            {!user.isActive && <Badge tone="red">Inactive</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
      </div>

      <AnalyticsFilters
        current={current}
        basePath={`/recruiters/${id}`}
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
        showStatusFilters={false}
        showRecruiterFilter={false}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jobs assigned"
          value={jobsAssigned}
          icon={Briefcase}
          tone="slate"
        />
        <StatCard
          label="Submissions"
          value={stats.submissions}
          icon={Send}
          tone="indigo"
        />
        <StatCard
          label="Interviews"
          value={stats.interviews}
          icon={CalendarCheck}
          tone="blue"
        />
        <StatCard
          label="Selected"
          value={stats.selected}
          icon={CircleCheck}
          tone="green"
        />
        <StatCard
          label="Offers released"
          value={stats.offerReleased}
          icon={FileText}
          tone="indigo"
        />
        <StatCard
          label="Joined"
          value={stats.joined}
          icon={UserCheck}
          tone="green"
        />
        <StatCard
          label="Rejected"
          value={stats.rejected}
          icon={CircleX}
          tone="red"
        />
        <StatCard
          label="On hold"
          value={stats.onHold}
          icon={CirclePause}
          tone="amber"
        />
      </div>

      <Card title="Submissions over the last 6 months">
        <BarChartCard
          data={monthly.map((m) => ({ label: m.label, value: m.count }))}
          orientation="vertical"
          height={220}
        />
      </Card>

      <Card title={`Assigned jobs (${assignments.length})`}>
        {assignments.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No jobs assigned for the selected filters.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Job</Th>
                <Th>Client</Th>
                <Th>Vendor</Th>
                <Th>Status</Th>
                <Th className="text-right">Submissions</Th>
                <Th>Assigned</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td label="Job">
                    <Link
                      href={`/jobs/${a.job.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {a.job.title}
                    </Link>
                  </Td>
                  <Td label="Client">{a.job.client.name}</Td>
                  <Td label="Vendor">{a.job.vendor.name}</Td>
                  <Td label="Status">
                    <Badge tone={JOB_STATUS_TONE[a.job.status]}>
                      {JOB_STATUS_LABEL[a.job.status]}
                    </Badge>
                  </Td>
                  <Td label="Submissions" className="text-right tabular-nums">
                    {a.job._count.submissions}
                  </Td>
                  <Td label="Assigned" className="whitespace-nowrap">
                    {formatDate(a.assignedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={`Submissions (${submissions.length})`}>
        {submissions.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No submissions for the selected filters.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Candidate</Th>
                <Th>Job</Th>
                <Th>Status</Th>
                <Th className="text-right">Rounds</Th>
                <Th>Submitted</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td label="Candidate">
                    <Link
                      href={`/submissions/${s.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {s.candidate.fullName}
                    </Link>
                  </Td>
                  <Td label="Job">{s.job.title}</Td>
                  <Td label="Status">
                    <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Badge>
                  </Td>
                  <Td label="Rounds" className="text-right tabular-nums">
                    {s._count.interviewRounds}
                  </Td>
                  <Td label="Submitted" className="whitespace-nowrap">
                    {formatDate(s.submittedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ActivityTimeline entries={activity} />
    </div>
  );
}
