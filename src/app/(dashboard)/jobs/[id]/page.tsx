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
import { Pagination } from "@/components/ui/pagination";
import { SUB_PAGE_SIZE as PAGE_SIZE, parsePage } from "@/lib/filters";
import {
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  WORK_MODE_LABEL,
  JOB_PRIORITY_LABEL,
  JOB_PRIORITY_TONE,
  jobSourceLabel,
} from "@/lib/labels";
import {
  formatDate,
  formatRate,
  formatJobDisplayId,
  formatSubmissionDisplayId,
} from "@/lib/format";
import { ilaborStatusToJobStatus } from "@/lib/validation/ilabor-import";
import { RecentlyViewedTracker } from "@/components/layout/recently-viewed";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const subsPage = parsePage(
    Array.isArray(sp.subs) ? sp.subs[0] : sp.subs,
  );
  const [
    job,
    { rows: submissions, total: submissionsTotal, page: submissionsPage },
    timeline,
    notes,
  ] = await Promise.all([
    getJobDetail(id),
    getJobSubmissions(id, { page: subsPage }),
    getTimelineFor("JOB", id),
    getNotesFor("JOB", id),
  ]);
  if (!job) notFound();
  const submissionsTotalPages = Math.max(
    1,
    Math.ceil(submissionsTotal / PAGE_SIZE),
  );

  // For iLabor-linked jobs: warn when the LuminTrack status has drifted from
  // what iLabor most recently reported. Catches silent post-import re-imports.
  const ilaborDrift =
    job.portal && job.externalStatusRaw
      ? ilaborStatusToJobStatus(job.externalStatusRaw).status !== job.status
      : false;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <RecentlyViewedTracker
        kind="job"
        id={job.id}
        label={job.title}
        sub={job.client.name}
      />
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
              <span className="inline-flex items-center gap-1.5">
                {job.externalStatusRaw ?? "—"}
                {ilaborDrift ? (
                  <Badge tone="amber">
                    Differs from LuminTrack ({JOB_STATUS_LABEL[job.status]})
                  </Badge>
                ) : null}
              </span>
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
          {/* Optional planning fields — only render the ones the recruiter
              actually filled in. iLabor jobs already show these in their own
              card above; this surfaces them for manually-added jobs too. */}
          {!job.portal && job.positions != null && (
            <SummaryItem label="Positions">{job.positions}</SummaryItem>
          )}
          {!job.portal && job.reqType && (
            <SummaryItem label="Position type">{job.reqType}</SummaryItem>
          )}
          {!job.portal && job.department && (
            <SummaryItem label="Department">{job.department}</SummaryItem>
          )}
          {!job.portal && job.durationLabel && (
            <SummaryItem label="Duration">{job.durationLabel}</SummaryItem>
          )}
          {!job.portal && job.startDate && (
            <SummaryItem label="Projected start">
              {formatDate(job.startDate)}
            </SummaryItem>
          )}
          {!job.portal && job.endDate && (
            <SummaryItem label="Projected end">
              {formatDate(job.endDate)}
            </SummaryItem>
          )}
          {!job.portal && job.atsId && (
            <SummaryItem label="Customer ref">{job.atsId}</SummaryItem>
          )}
          {/* §A2 LuminTrack-native planning fields — shown for both manual
              and iLabor jobs since they're not in the iLabor payload. */}
          {job.workMode && (
            <SummaryItem label="Work mode">
              {WORK_MODE_LABEL[job.workMode]}
            </SummaryItem>
          )}
          {job.priority && (
            <SummaryItem label="Priority">
              <Badge tone={JOB_PRIORITY_TONE[job.priority]}>
                {JOB_PRIORITY_LABEL[job.priority]}
              </Badge>
            </SummaryItem>
          )}
          {job.targetCloseDate && (
            <SummaryItem label="Target hire-by">
              {formatDate(job.targetCloseDate)}
            </SummaryItem>
          )}
          {job.postingUrl && (
            <SummaryItem label="Posting URL">
              <a
                href={job.postingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-indigo-600 hover:underline"
              >
                {job.postingUrl}
              </a>
            </SummaryItem>
          )}
          {job.workAuthRequirement && (
            <SummaryItem label="Work auth">
              {job.workAuthRequirement}
            </SummaryItem>
          )}
          {job.skills.length > 0 && (
            <SummaryItem label="Skills">
              <div className="flex flex-wrap gap-1">
                {job.skills.map((s) => (
                  <Badge key={s} tone="slate">
                    {s}
                  </Badge>
                ))}
              </div>
            </SummaryItem>
          )}
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
            Submitted candidates ({submissionsTotal})
          </h2>
          <LinkButton href={`/jobs/${job.id}/submissions/new`} size="sm">
            <Plus className="h-4 w-4" />
            Submit candidate
          </LinkButton>
        </div>
        {submissionsTotal === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No candidates submitted to this job yet.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Sub ID</Th>
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
                  <Td label="Sub ID" secondary className="font-mono text-xs">
                    {formatSubmissionDisplayId(s)}
                  </Td>
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
                        rel="noopener noreferrer"
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
        {submissionsTotal > PAGE_SIZE && (
          <div className="mt-3">
            <Pagination
              page={submissionsPage}
              totalPages={submissionsTotalPages}
              total={submissionsTotal}
              paramKey="subs"
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </section>

      <NotesSection entityType="JOB" entityId={job.id} notes={notes} />

      <ActivityTimeline entries={timeline} />
    </div>
  );
}
