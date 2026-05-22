import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusPipeline } from "@/components/submissions/status-pipeline";
import { SubmissionStatusForm } from "@/components/submissions/submission-status-form";
import { InterviewRoundsManager } from "@/components/interviews/interview-rounds-manager";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { NotesSection } from "@/components/notes/notes-section";
import { getSubmissionDetail } from "@/server/queries/submissions";
import { getTimelineFor } from "@/server/queries/timeline";
import { getNotesFor } from "@/server/queries/notes";
import { SUBMISSION_STATUS_LABEL, SUBMISSION_STATUS_TONE } from "@/lib/labels";
import { formatDate, formatRate } from "@/lib/format";

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
      </div>

      <Card title="Status pipeline">
        <StatusPipeline status={submission.status} />
      </Card>

      <Card title="Update status">
        <SubmissionStatusForm
          submissionId={submission.id}
          status={submission.status}
          rejectionReason={submission.rejectionReason ?? ""}
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
          <SummaryItem label="Sister company source">
            {job.sisterCompanySource.name}
          </SummaryItem>
          <SummaryItem label="Submitted by">
            {submission.submittedBy.fullName}
          </SummaryItem>
          <SummaryItem label="Submitted date">
            {formatDate(submission.submittedAt)}
          </SummaryItem>
          <SummaryItem label="Candidate rate">
            {formatRate(submission.candidateRate)}
          </SummaryItem>
          <SummaryItem label="Resume used">
            {submission.resumeDriveLink ? (
              <a
                href={submission.resumeDriveLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                Open resume
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              "—"
            )}
          </SummaryItem>
          <SummaryItem label="Last updated">
            {formatDate(submission.updatedAt)}
          </SummaryItem>
        </dl>

        <div className="mt-5">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Submission notes
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">
            {submission.submissionNotes || "—"}
          </dd>
        </div>

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
