import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Pencil, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import {
  getVendorRequirement,
} from "@/server/queries/requirements";
import {
  cancelVendorRequirement,
  closeVendorRequirement,
} from "@/server/actions/requirements";
import { getTimelineFor } from "@/server/queries/timeline";
import {
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_STATUS_TONE,
  BENCH_ENGAGEMENT_LABEL,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
  JOB_STATUS_LABEL,
} from "@/lib/labels";
import {
  formatDate,
  formatRate,
  formatVendorRequirementDisplayId,
  formatSubmissionDisplayId,
} from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { canManageRequirements } from "@/lib/permissions";

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

export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, requirement] = await Promise.all([
    getCurrentUser(),
    getVendorRequirement(id),
  ]);
  if (!requirement) notFound();

  const timeline = await getTimelineFor("REQUIREMENT", requirement.id);

  const canManage = canManageRequirements(user ?? undefined);
  const isOpen = requirement.status === "OPEN";
  // The convert action blocks a submission when the underlying job is no longer
  // accepting — surface that here so the recruiter isn't led to a dead-end.
  const jobAccepting = !["CLOSED", "FILLED", "CANCELLED"].includes(
    requirement.job.status,
  );
  const submissions = requirement.submissions;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/vendor-portal"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to requirements
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-500">
            {formatVendorRequirementDisplayId(requirement)}
          </p>
          {/* Title the requirement by its job (requisition) — a VPR collects
              many submissions, so it has no single candidate. */}
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {requirement.job.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
            <span>{requirement.job.client?.name ?? "—"}</span>
            {requirement.location && <span>· {requirement.location}</span>}
            <span aria-hidden>·</span>
            <Link
              href={`/jobs/${requirement.job.id}`}
              className="text-indigo-600 hover:underline"
            >
              View job
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={REQUIREMENT_STATUS_TONE[requirement.status]}>
            {REQUIREMENT_STATUS_LABEL[requirement.status]}
          </Badge>
          {isOpen && jobAccepting && (
            <Link
              href={`/vendor-portal/${requirement.id}/convert`}
              className={buttonClass("primary", "sm")}
            >
              <Send className="h-4 w-4" />
              Submit a candidate
            </Link>
          )}
          {isOpen && canManage && (
            <>
              <Link
                href={`/vendor-portal/${requirement.id}/edit`}
                className={buttonClass("secondary", "sm")}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
              <ConfirmSubmit
                action={closeVendorRequirement}
                fields={{ id: requirement.id }}
                title="Close this requirement?"
                description="It will be marked closed and stop accepting new submissions. The submissions already made against it are kept."
                confirmLabel="Close requirement"
                trigger={
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Close
                  </span>
                }
                triggerClassName={buttonClass("secondary", "sm")}
              />
              <ConfirmSubmit
                action={cancelVendorRequirement}
                fields={{ id: requirement.id }}
                title="Cancel this requirement?"
                description="It will be marked cancelled and removed from the planning queue. This can't be undone."
                confirmLabel="Cancel requirement"
                trigger={
                  <span className="inline-flex items-center gap-1.5">
                    <X className="h-4 w-4" />
                    Cancel
                  </span>
                }
                triggerClassName={buttonClass("danger", "sm")}
              />
            </>
          )}
        </div>
      </header>

      {isOpen && !jobAccepting && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The job{" "}
          <Link
            href={`/jobs/${requirement.job.id}`}
            className="font-medium underline"
          >
            {requirement.job.title}
          </Link>{" "}
          is <strong>{JOB_STATUS_LABEL[requirement.job.status]}</strong> and is
          no longer accepting submissions, so this requirement can&apos;t be
          moved to a submission. Reopen the job, or close this requirement.
        </div>
      )}

      <Card title={`Submissions (${submissions.length})`}>
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No candidates submitted against this requirement yet.
            {isOpen ? ' Use "Submit a candidate" above to add one.' : ""}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {submissions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/submissions/${s.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {s.candidate?.fullName ?? "—"}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-slate-400">
                    {formatSubmissionDisplayId(s)}
                  </span>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.submittedBy?.fullName ?? "—"}
                    {s.submittedAt ? ` · ${formatDate(s.submittedAt)}` : ""}
                  </p>
                </div>
                <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                  {SUBMISSION_STATUS_LABEL[s.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Requirement">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryItem label="Vendor">
            {requirement.job.vendor?.name ?? "—"}
          </SummaryItem>
          <SummaryItem label="Client">
            {requirement.job.client?.name ?? "—"}
          </SummaryItem>
          <SummaryItem label="Location">
            {requirement.location ?? requirement.job.location ?? "—"}
          </SummaryItem>
          <SummaryItem label="Engagement">
            {requirement.engagement
              ? BENCH_ENGAGEMENT_LABEL[requirement.engagement]
              : "—"}
          </SummaryItem>
          <SummaryItem label="Client rate">{formatRate(requirement.clientRate, "Undisclosed")}</SummaryItem>
          <SummaryItem label="Bill rate">{formatRate(requirement.billRate)}</SummaryItem>
          <SummaryItem label="Pay rate">{formatRate(requirement.payRate)}</SummaryItem>
          <SummaryItem label="Recruiter">
            {requirement.recruiter?.fullName ?? "—"}
          </SummaryItem>
          <SummaryItem label="Team lead">{requirement.teamLead ?? "—"}</SummaryItem>
          <SummaryItem label="Vendor recruiter">
            {requirement.vendorRecruiterName ?? "—"}
          </SummaryItem>
          <SummaryItem label="Created by">
            {requirement.createdBy?.fullName ?? "—"}
          </SummaryItem>
        </dl>
      </Card>

      {(requirement.jobDuties || requirement.submissionNotes) && (
        <Card title="Details">
          <dl className="space-y-4">
            {requirement.jobDuties && (
              <SummaryItem label="Job duties">
                <span className="whitespace-pre-wrap">{requirement.jobDuties}</span>
              </SummaryItem>
            )}
            {requirement.submissionNotes && (
              <SummaryItem label="Submission notes">
                <span className="whitespace-pre-wrap">
                  {requirement.submissionNotes}
                </span>
              </SummaryItem>
            )}
          </dl>
        </Card>
      )}

      <ActivityTimeline entries={timeline} />
    </div>
  );
}
