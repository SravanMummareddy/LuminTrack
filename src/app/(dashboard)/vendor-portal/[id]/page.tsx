import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import {
  getVendorRequirement,
} from "@/server/queries/requirements";
import { cancelVendorRequirement } from "@/server/actions/requirements";
import { getTimelineFor } from "@/server/queries/timeline";
import {
  REQUIREMENT_STATUS_LABEL,
  REQUIREMENT_STATUS_TONE,
  BENCH_ENGAGEMENT_LABEL,
} from "@/lib/labels";
import {
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
  const canConvert = isOpen && requirement.candidate != null;

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
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {requirement.candidate?.fullName ?? "Unassigned requirement"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            for{" "}
            <Link
              href={`/jobs/${requirement.job.id}`}
              className="text-indigo-600 hover:underline"
            >
              {requirement.job.title}
            </Link>{" "}
            · {requirement.job.client?.name ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={REQUIREMENT_STATUS_TONE[requirement.status]}>
            {REQUIREMENT_STATUS_LABEL[requirement.status]}
          </Badge>
          {canConvert && (
            <Link
              href={`/vendor-portal/${requirement.id}/convert`}
              className={buttonClass("primary", "sm")}
            >
              <Send className="h-4 w-4" />
              Move to submission
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

      {requirement.status === "CONVERTED" && requirement.convertedSubmission && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Moved to submission{" "}
          <Link
            href={`/submissions/${requirement.convertedSubmission.id}`}
            className="font-medium text-blue-700 underline"
          >
            {formatSubmissionDisplayId(requirement.convertedSubmission)}
          </Link>
          {requirement.convertedBy ? ` by ${requirement.convertedBy.fullName}` : ""}.
        </section>
      )}

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
          <SummaryItem label="Client rate">{formatRate(requirement.clientRate)}</SummaryItem>
          <SummaryItem label="Bill rate">{formatRate(requirement.billRate)}</SummaryItem>
          <SummaryItem label="Pay rate">{formatRate(requirement.payRate)}</SummaryItem>
          <SummaryItem label="Candidate rate">
            {formatRate(requirement.candidateRate)}
          </SummaryItem>
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

      <Card title="Candidate">
        {requirement.candidate ? (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <SummaryItem label="Name">
              <Link
                href={`/candidates/${requirement.candidate.id}`}
                className="text-indigo-600 hover:underline"
              >
                {requirement.candidate.fullName}
              </Link>
            </SummaryItem>
            <SummaryItem label="Company">
              {requirement.candidate.currentCompany ?? "—"}
            </SummaryItem>
            <SummaryItem label="Email">
              {requirement.candidate.email ?? "—"}
            </SummaryItem>
            <SummaryItem label="Phone">
              {requirement.candidate.phone ?? "—"}
            </SummaryItem>
            <SummaryItem label="Résumé">
              {requirement.resumeDriveLink ? (
                <a
                  href={requirement.resumeDriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  View résumé
                </a>
              ) : (
                "—"
              )}
            </SummaryItem>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">
            No candidate chosen yet — you can pick one when you move this to a
            submission, or set it now via Edit.
          </p>
        )}
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
