import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { LinkButton, Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { NotesSection } from "@/components/notes/notes-section";
import { getJobDetail } from "@/server/queries/jobs";
import { getJobSubmissions } from "@/server/queries/submissions";
import { getTimelineFor } from "@/server/queries/timeline";
import { getNotesFor } from "@/server/queries/notes";
import { changeJobStatus } from "@/server/actions/jobs";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  jobSourceLabel,
} from "@/lib/labels";
import { formatDate, formatRate, formatJobDisplayId } from "@/lib/format";

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

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

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, submissions, timeline, notes] = await Promise.all([
    getJobDetail(id),
    getJobSubmissions(id),
    getTimelineFor("JOB", id),
    getNotesFor("JOB", id),
  ]);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{job.title}</h1>
            <Badge tone={JOB_STATUS_TONE[job.status]}>
              {JOB_STATUS_LABEL[job.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono text-xs text-slate-400">
              {formatJobDisplayId(job)}
            </span>
            <span className="mx-1.5 text-slate-300">·</span>
            {job.client.name} · {job.vendor.name}
          </p>
        </div>
        <LinkButton href={`/jobs/${job.id}/edit`} variant="secondary">
          <Pencil className="h-4 w-4" />
          Edit job
        </LinkButton>
      </div>

      <Card title="Status">
        <form action={changeJobStatus} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={job.id} />
          <div className="w-full sm:w-48">
            <label
              htmlFor="status"
              className="mb-1 block text-xs font-medium text-slate-500"
            >
              Update job status
            </label>
            <Select id="status" name="status" defaultValue={job.status}>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Update
          </Button>
        </form>
      </Card>

      {job.portal ? (
        <Card title={`${job.portal.name} requisition`}>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryItem label="Requisition ID">
              {job.portalRefId ?? "—"}
            </SummaryItem>
            <SummaryItem label="Customer ref">{job.atsId ?? "—"}</SummaryItem>
            <SummaryItem label="iLabor status">
              {job.externalStatusRaw ?? "—"}
            </SummaryItem>
            <SummaryItem label="Position type">{job.reqType ?? "—"}</SummaryItem>
            <SummaryItem label="Department">{job.department ?? "—"}</SummaryItem>
            <SummaryItem label="Positions">{job.positions ?? "—"}</SummaryItem>
            <SummaryItem label="Duration">{job.durationLabel ?? "—"}</SummaryItem>
            <SummaryItem label="Projected start">
              {job.startDate ? formatDate(job.startDate) : "—"}
            </SummaryItem>
            <SummaryItem label="Projected end">
              {job.endDate ? formatDate(job.endDate) : "—"}
            </SummaryItem>
            <SummaryItem label="Released">
              {job.releasedDate ? formatDate(job.releasedDate) : "—"}
            </SummaryItem>
            <SummaryItem label="Assigned to (iLabor)">
              {job.assignedToName ?? "—"}
            </SummaryItem>
            <SummaryItem label="Account manager">
              {job.ownerName ?? "—"}
            </SummaryItem>
            <SummaryItem label="iLabor subs">
              {job.externalSubsCount ?? "—"}
              {job.externalActiveCount != null
                ? ` (${job.externalActiveCount} active)`
                : ""}
            </SummaryItem>
            <SummaryItem label="Last imported">
              {job.lastImportedAt ? formatDate(job.lastImportedAt) : "—"}
            </SummaryItem>
          </dl>
        </Card>
      ) : null}

      <Card title="Job summary">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Client">{job.client.name}</SummaryItem>
          <SummaryItem label="Vendor">{job.vendor.name}</SummaryItem>
          <SummaryItem label="Source">{jobSourceLabel(job)}</SummaryItem>
          <SummaryItem label="Location">{job.location || "—"}</SummaryItem>
          <SummaryItem label="Vendor rate">{formatRate(job.vendorRate)}</SummaryItem>
          <SummaryItem label="Candidate rate">
            {formatRate(job.candidateRate)}
          </SummaryItem>
          <SummaryItem label="Created by">{job.createdBy.fullName}</SummaryItem>
          <SummaryItem label="Created">{formatDate(job.createdAt)}</SummaryItem>
          <SummaryItem label="Last updated">{formatDate(job.updatedAt)}</SummaryItem>
        </dl>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Job description
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
              {job.description || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
              {job.notes || "—"}
            </dd>
          </div>
        </div>

        <div className="mt-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Assigned recruiters
          </dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {job.assignments.length === 0 ? (
              <span className="text-sm text-slate-500">No recruiters assigned</span>
            ) : (
              job.assignments.map((a) => (
                <Badge key={a.id} tone="indigo">
                  {a.recruiter.fullName}
                </Badge>
              ))
            )}
          </dd>
        </div>
      </Card>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Submitted candidates ({submissions.length})
          </h2>
          <LinkButton href={`/jobs/${job.id}/submissions/new`} size="sm">
            <Plus className="h-4 w-4" />
            Submit candidate
          </LinkButton>
        </div>
        {submissions.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No candidates submitted to this job yet.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Candidate</Th>
                <Th>Submitted by</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th>Resume</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Rounds</Th>
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
                  <Td label="Submitted by">{s.submittedBy.fullName}</Td>
                  <Td label="Submitted" className="whitespace-nowrap">
                    {formatDate(s.submittedAt)}
                  </Td>
                  <Td label="Status">
                    <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Badge>
                  </Td>
                  <Td label="Resume">
                    {s.resumeDriveLink ? (
                      <a
                        href={s.resumeDriveLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {s.candidateResume?.label ?? "Resume"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td label="Rate" className="text-right tabular-nums">
                    {formatRate(s.candidateRate)}
                  </Td>
                  <Td label="Rounds" className="text-right tabular-nums">
                    {s._count.interviewRounds}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <NotesSection entityType="JOB" entityId={job.id} notes={notes} />

      <ActivityTimeline entries={timeline} />
    </div>
  );
}
