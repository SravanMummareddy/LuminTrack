import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import { Pencil, Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { NotesSection } from "@/components/notes/notes-section";
import { prisma } from "@/server/db";
import { getJobDetail } from "@/server/queries/jobs";
import { getJobSubmissions } from "@/server/queries/submissions";
import { getRequirementsForJob } from "@/server/queries/requirements";
import { getTimelineFor } from "@/server/queries/timeline";
import { getNotesFor } from "@/server/queries/notes";
import { getCurrentUser } from "@/lib/session";
import { canManageRequirements } from "@/lib/permissions";
import { JobStatusForm } from "@/components/jobs/job-status-form";
import { JobPipelineSteps } from "@/components/jobs/job-pipeline-steps";
import { JobTrashBanner } from "@/components/jobs/job-trash-banner";
import { JobDangerZone } from "@/components/jobs/job-danger-zone";
import { JOB_TRASH_RETENTION_DAYS } from "@/server/job-erase";
import { Pagination } from "@/components/ui/pagination";
import { SUB_PAGE_SIZE as PAGE_SIZE, parsePage } from "@/lib/filters";
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  WORK_MODE_LABEL,
  JOB_PRIORITY_LABEL,
  JOB_PRIORITY_TONE,
  jobSourceLabel,
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_STATUS_TONE,
  BENCH_ENGAGEMENT_LABEL,
} from "@/lib/labels";
import {
  formatDate,
  formatRate,
  formatJobDisplayId,
  formatSubmissionDisplayId,
  formatVendorRequirementDisplayId,
  deletedSuffix,
} from "@/lib/format";
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
    requirements,
    currentUser,
    // Local non-terminal submission count — what we actually have in the
    // pipeline right now. Drives the "in flight" hint on the status form.
    localActiveCount,
    activePlacementCount,
  ] = await Promise.all([
    getJobDetail(id),
    getJobSubmissions(id, { page: subsPage }),
    getTimelineFor("JOB", id),
    getNotesFor("JOB", id),
    getRequirementsForJob(id),
    getCurrentUser(),
    prisma.submission.count({
      where: {
        jobId: id,
        status: {
          in: [
            "SUBMITTED",
            "RESUME_PICKED",
            "VENDOR_SCREENING_CALL",
            "CLIENT_INTERVIEW",
            "SELECTED",
            "ON_HOLD",
            "OFFER_RELEASED",
            "OFFER_ACCEPTED",
          ],
        },
      },
    }),
    // Seats actually filled right now — active placements against this job.
    prisma.placement.count({
      where: { jobId: id, status: { in: ["ACTIVE", "EXTENDED"] } },
    }),
  ]);
  if (!job) notFound();
  const canManageReq = canManageRequirements(currentUser ?? undefined);
  const isErased = Boolean(job.erasedAt);
  const isTrashed = Boolean(job.deletedAt) && !isErased;
  const isLive = !isTrashed && !isErased;
  // VPR-first: candidates are submitted against a requirement, never the job
  // directly. Jump straight to the convert form when there's a single open VPR,
  // otherwise scroll to the requirements section to pick or create one.
  const openRequirements = requirements.filter((r) => r.status === "OPEN");
  const submitHref =
    openRequirements.length === 1
      ? `/vendor-portal/${openRequirements[0].id}/convert`
      : "#requirements";
  const submissionsTotalPages = Math.max(
    1,
    Math.ceil(submissionsTotal / PAGE_SIZE),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <RecentlyViewedTracker
        kind="job"
        id={job.id}
        label={job.title}
        sub={job.client.name}
      />
      <BackLink fallbackHref="/jobs" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{job.title}</h1>
            {isErased && <Badge tone="red">Erased</Badge>}
            {isTrashed && <Badge tone="amber">In trash</Badge>}
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
        {isLive && (
          <LinkButton href={`/jobs/${job.id}/edit`} variant="secondary">
            <Pencil className="h-4 w-4" />
            Edit job
          </LinkButton>
        )}
      </div>

      {isTrashed && job.deletedAt && (
        <JobTrashBanner
          jobId={job.id}
          jobTitle={job.title}
          deletedAt={job.deletedAt.toISOString()}
          retentionDays={JOB_TRASH_RETENTION_DAYS}
          canManage={canManageReq}
        />
      )}

      {isLive && (
        <>
          <JobPipelineSteps
            jobId={job.id}
            vprCount={requirements.length}
            submissionCount={submissionsTotal}
            canManageReq={canManageReq}
            submitHref={submitHref}
          />

          <Card title="Status">
            <JobStatusForm
              jobId={job.id}
              status={job.status}
              openVprCount={openRequirements.length}
              inFlightCount={localActiveCount}
              positions={job.positions}
              activePlacementCount={activePlacementCount}
            />
          </Card>
        </>
      )}

      <Card title="Job summary">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Client">{job.client.name}</SummaryItem>
          <SummaryItem label="Vendor">{job.vendor.name}</SummaryItem>
          <SummaryItem label="Source">{jobSourceLabel(job)}</SummaryItem>
          <SummaryItem label="Location">{job.location || "—"}</SummaryItem>
          <SummaryItem label="Client rate">{formatRate(job.clientRate, "Undisclosed")}</SummaryItem>
          <SummaryItem label="Vendor rate">{formatRate(job.vendorRate)}</SummaryItem>
          <SummaryItem label="Created by">{job.createdBy.fullName}</SummaryItem>
          <SummaryItem label="Created">{formatDate(job.createdAt)}</SummaryItem>
          <SummaryItem label="Last updated">{formatDate(job.updatedAt)}</SummaryItem>
          {/* Optional planning fields — only render the ones the recruiter
              actually filled in. */}
          {job.positions != null && (
            <SummaryItem label="Positions">{job.positions}</SummaryItem>
          )}
          {job.reqType && (
            <SummaryItem label="Position type">{job.reqType}</SummaryItem>
          )}
          {job.department && (
            <SummaryItem label="Department">{job.department}</SummaryItem>
          )}
          {job.durationLabel && (
            <SummaryItem label="Duration">{job.durationLabel}</SummaryItem>
          )}
          {job.startDate && (
            <SummaryItem label="Projected start">
              {formatDate(job.startDate)}
            </SummaryItem>
          )}
          {job.endDate && (
            <SummaryItem label="Projected end">
              {formatDate(job.endDate)}
            </SummaryItem>
          )}
          {job.atsId && (
            <SummaryItem label="Customer ref">{job.atsId}</SummaryItem>
          )}
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

      </Card>

      <section id="requirements" className="scroll-mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Vendor portal requirements ({requirements.length})
          </h2>
          {canManageReq && (
            <LinkButton href={`/vendor-portal/new?jobId=${job.id}`} size="sm">
              <Plus className="h-4 w-4" />
              Create requirement
            </LinkButton>
          )}
        </div>
        {requirements.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
            No planned requirements for this job yet.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>ID</Th>
                <Th>Candidate</Th>
                <Th>Recruiter</Th>
                <Th>Engagement</Th>
                <Th className="text-right">Pay</Th>
                <Th className="text-right">Bill</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requirements.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td label="ID" secondary className="font-mono text-xs">
                    <Link
                      href={`/vendor-portal/${r.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {formatVendorRequirementDisplayId(r)}
                    </Link>
                  </Td>
                  <Td label="Candidate">{r.candidate?.fullName ?? "—"}</Td>
                  <Td label="Recruiter" secondary>
                    {r.recruiter?.fullName ?? "—"}
                  </Td>
                  <Td label="Engagement" secondary>
                    {r.engagement ? BENCH_ENGAGEMENT_LABEL[r.engagement] : "—"}
                  </Td>
                  <Td label="Pay" className="text-right tabular-nums">
                    {formatRate(r.payRate)}
                  </Td>
                  <Td label="Bill" className="text-right tabular-nums">
                    {formatRate(r.billRate)}
                  </Td>
                  <Td label="Status">
                    <Badge tone={REQUIREMENT_STATUS_TONE[r.status]}>
                      {REQUIREMENT_STATUS_LABEL[r.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Submitted candidates ({submissionsTotal})
          </h2>
          <LinkButton href={submitHref} size="sm">
            <Plus className="h-4 w-4" />
            Submit via requirement
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
                      {deletedSuffix(s.candidate)}
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
                    {s.candidateResumeId ? (
                      <a
                        href={`/api/resumes/${s.candidateResumeId}`}
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

      {canManageReq && isLive && (
        <JobDangerZone
          jobId={job.id}
          jobTitle={job.title}
          retentionDays={JOB_TRASH_RETENTION_DAYS}
          status={job.status}
          openVprCount={openRequirements.length}
          inFlightCount={localActiveCount}
          activePlacementCount={activePlacementCount}
        />
      )}
    </div>
  );
}
