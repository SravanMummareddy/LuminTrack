import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { StatusPipeline } from "@/components/submissions/status-pipeline";
import { SubmissionStatusForm } from "@/components/submissions/submission-status-form";
import { InterviewRoundsManager } from "@/components/interviews/interview-rounds-manager";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { NotesSection } from "@/components/notes/notes-section";
import { getSubmissionDetail } from "@/server/queries/submissions";
import { getTimelineFor } from "@/server/queries/timeline";
import { getNotesFor } from "@/server/queries/notes";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  BENCH_ENGAGEMENT_LABEL,
  jobSourceLabel,
} from "@/lib/labels";
import { formatDate, formatRate, formatSubmissionDisplayId } from "@/lib/format";
import { toDrivePreviewUrl } from "@/lib/resume";

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

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [submission, timeline, notes] = await Promise.all([
    getSubmissionDetail(id),
    getTimelineFor("SUBMISSION", id),
    getNotesFor("SUBMISSION", id),
  ]);
  if (!submission) notFound();

  const { candidate, job } = submission;
  const resumePreviewUrl = submission.resumeDriveLink
    ? toDrivePreviewUrl(submission.resumeDriveLink)
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/submissions"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to submissions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {candidate.fullName}
            </h1>
            <Badge tone={SUBMISSION_STATUS_TONE[submission.status]}>
              {SUBMISSION_STATUS_LABEL[submission.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-mono text-xs text-slate-400">
              {formatSubmissionDisplayId(submission)}
            </span>
            <span className="mx-1.5 text-slate-300">·</span>
            Submitted to{" "}
            <Link
              href={`/jobs/${job.id}`}
              className="text-indigo-600 hover:underline"
            >
              {job.title}
            </Link>{" "}
            · {job.client.name} · {job.vendor.name}
          </p>
        </div>
        <LinkButton href={`/submissions/${submission.id}/edit`} variant="secondary">
          <Pencil className="h-4 w-4" />
          Edit submission
        </LinkButton>
      </div>

      <Card title="Status pipeline">
        <StatusPipeline status={submission.status} />
      </Card>

      <Card title="Update status">
        <SubmissionStatusForm
          key={submission.status}
          submissionId={submission.id}
          status={submission.status}
        />
      </Card>

      <Card title="Submission summary">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Candidate">
            <Link
              href={`/candidates/${candidate.id}`}
              className="text-indigo-600 hover:underline"
            >
              {candidate.fullName}
            </Link>
          </SummaryItem>
          <SummaryItem label="Job">
            <Link
              href={`/jobs/${job.id}`}
              className="text-indigo-600 hover:underline"
            >
              {job.title}
            </Link>
          </SummaryItem>
          <SummaryItem label="Client">{job.client.name}</SummaryItem>
          <SummaryItem label="Vendor">{job.vendor.name}</SummaryItem>
          <SummaryItem label="Source">{jobSourceLabel(job)}</SummaryItem>
          <SummaryItem label="Submitted by">
            {submission.submittedBy.fullName}
          </SummaryItem>
          <SummaryItem label="Submitted date">
            {formatDate(submission.submittedAt)}
          </SummaryItem>
          <SummaryItem label="Candidate rate">
            {formatRate(submission.candidateRate)}
          </SummaryItem>
          <SummaryItem label="Last updated">
            {formatDate(submission.updatedAt)}
          </SummaryItem>
          {submission.expectedJoinDate ? (
            <SummaryItem label="Expected join">
              {formatDate(submission.expectedJoinDate)}
            </SummaryItem>
          ) : null}
          {submission.actualJoinDate ? (
            <SummaryItem label="Actual join">
              {formatDate(submission.actualJoinDate)}
            </SummaryItem>
          ) : null}
          {submission.engagement ? (
            <SummaryItem label="Engagement">
              {BENCH_ENGAGEMENT_LABEL[submission.engagement]}
            </SummaryItem>
          ) : null}
          {submission.vendorRecruiterName ? (
            <SummaryItem label="Vendor recruiter">
              {submission.vendorRecruiterName}
            </SummaryItem>
          ) : null}
        </dl>

        {submission.jobDuties ? (
          <div className="mt-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Job duties
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
              {submission.jobDuties}
            </dd>
          </div>
        ) : null}

        <div className="mt-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Submission notes
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
            {submission.submissionNotes || "—"}
          </dd>
        </div>

        {submission.duplicateReason && (
          <div className="mt-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Duplicate override reason
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
              {submission.duplicateReason}
            </dd>
          </div>
        )}

        {submission.status === "REJECTED" && (
          <div className="mt-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Rejection reason
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
              {submission.rejectionReason || "—"}
            </dd>
          </div>
        )}
      </Card>

      <Card title="Resume used">
        {!submission.resumeDriveLink ? (
          <p className="text-sm text-slate-400">
            No resume recorded for this submission.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {submission.candidateResume && (
                <Badge tone="indigo">{submission.candidateResume.label}</Badge>
              )}
              <a
                href={submission.resumeDriveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
              >
                Open resume in a new tab
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {resumePreviewUrl ? (
              <iframe
                src={resumePreviewUrl}
                title="Resume preview"
                // Drive's embedded viewer needs both `allow-scripts` and
                // `allow-same-origin` to render. Restricting the rest of the
                // sandbox stops the embed from popping new windows, escaping
                // to top, or running forms against our origin.
                sandbox="allow-scripts allow-same-origin"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-[70vh] w-full rounded-md border border-slate-200 md:h-[600px]"
              />
            ) : (
              <p className="text-xs text-slate-500">
                Inline preview is available for Google Drive links only — use
                the link above to open this resume.
              </p>
            )}
          </div>
        )}
      </Card>

      <InterviewRoundsManager
        submissionId={submission.id}
        rounds={submission.interviewRounds}
      />

      <NotesSection
        entityType="SUBMISSION"
        entityId={submission.id}
        notes={notes}
        title="Notes & feedback"
      />

      <ActivityTimeline entries={timeline} />
    </div>
  );
}
