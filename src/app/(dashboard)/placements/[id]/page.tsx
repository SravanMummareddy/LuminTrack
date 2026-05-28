import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { ExtensionHistory } from "@/components/placements/extension-history";
import { PlacementEditButton } from "@/components/placements/placement-edit-form";
import { PlacementEndButton } from "@/components/placements/placement-end-form";
import {
  getPlacement,
  getReplacementCandidates,
} from "@/server/queries/placements";
import { getTimelineFor } from "@/server/queries/timeline";
import {
  PLACEMENT_STATUS_LABEL,
  PLACEMENT_STATUS_TONE,
  PLACEMENT_END_REASON_LABEL,
  MARGIN_AMBER_THRESHOLD_PCT,
} from "@/lib/labels";
import {
  formatDate,
  formatPlacementDisplayId,
  formatSubmissionDisplayId,
} from "@/lib/format";
import { requireUser } from "@/lib/session";

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

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export default async function PlacementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, placement] = await Promise.all([
    requireUser(),
    getPlacement(id),
  ]);
  if (!placement) notFound();

  // Rates editable for admins or the submitting recruiter.
  const canManageRates =
    user.role === "ADMIN" ||
    placement.submission.submittedById === user.id;
  // Anyone with placements access can extend / end (rates inside those forms
  // are gated separately).
  const canExtend =
    placement.status === "ACTIVE" || placement.status === "EXTENDED";

  const [timeline, replacements] = await Promise.all([
    getTimelineFor("CANDIDATE", placement.candidateId),
    canExtend
      ? getReplacementCandidates({
          jobId: placement.jobId,
          excludeSubmissionId: placement.submission.id,
        })
      : Promise.resolve([]),
  ]);

  const ratesPending = placement.billRate === 0 && placement.payRate === 0;
  const marginTone =
    placement.margin < 0
      ? "text-red-600"
      : placement.marginPct !== null && placement.marginPct < MARGIN_AMBER_THRESHOLD_PCT
        ? "text-amber-700"
        : "text-slate-900";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/placements"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to placements
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-500">
            {formatPlacementDisplayId(placement)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {placement.candidate.fullName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            on{" "}
            <Link
              href={`/jobs/${placement.job.id}`}
              className="text-indigo-600 hover:underline"
            >
              {placement.job.title}
            </Link>{" "}
            · {placement.job.client.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={PLACEMENT_STATUS_TONE[placement.status]}>
            {PLACEMENT_STATUS_LABEL[placement.status]}
          </Badge>
          <PlacementEditButton
            placement={{
              id: placement.id,
              startDate: placement.startDate,
              endDate: placement.endDate,
              billRate: placement.billRate,
              payRate: placement.payRate,
              clientPoNumber: placement.clientPoNumber,
              invoiceRef: placement.invoiceRef,
              onsiteManagerName: placement.onsiteManagerName,
              onsiteManagerEmail: placement.onsiteManagerEmail,
            }}
            canManageRates={canManageRates}
          />
          {canExtend && (
            <PlacementEndButton
              placementId={placement.id}
              replacements={replacements}
            />
          )}
        </div>
      </header>

      <Card title="Summary">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryItem label="Start">{formatDate(placement.startDate)}</SummaryItem>
          <SummaryItem label="End">
            {placement.endDate ? formatDate(placement.endDate) : "Open-ended"}
          </SummaryItem>
          <SummaryItem label="Bill">
            {canManageRates ? money(placement.billRate) : "—"}
          </SummaryItem>
          <SummaryItem label="Pay">
            {canManageRates ? money(placement.payRate) : "—"}
          </SummaryItem>
          <SummaryItem label="Margin">
            {canManageRates ? (
              ratesPending ? (
                <span className="text-amber-700">⚠ Rates pending</span>
              ) : (
                <span className={marginTone}>
                  {money(placement.margin)}
                  {placement.marginPct !== null && (
                    <span className="ml-1 text-xs text-slate-500">
                      ({placement.marginPct.toFixed(1)}%)
                    </span>
                  )}
                </span>
              )
            ) : (
              "—"
            )}
          </SummaryItem>
          <SummaryItem label="Recruiter">
            {placement.submission.submittedBy.fullName}
          </SummaryItem>
          <SummaryItem label="Submission">
            <Link
              href={`/submissions/${placement.submission.id}`}
              className="text-indigo-600 hover:underline"
            >
              {formatSubmissionDisplayId(placement.submission)}
            </Link>
          </SummaryItem>
          <SummaryItem label="Candidate">
            <Link
              href={`/candidates/${placement.candidate.id}`}
              className="text-indigo-600 hover:underline"
            >
              View profile
            </Link>
          </SummaryItem>
        </dl>
      </Card>

      <Card title="Details">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <SummaryItem label="Client PO #">
            {placement.clientPoNumber ?? "—"}
          </SummaryItem>
          <SummaryItem label="Invoice ref">
            {placement.invoiceRef ?? "—"}
          </SummaryItem>
          <SummaryItem label="Onsite manager">
            {placement.onsiteManagerName ?? "—"}
            {placement.onsiteManagerEmail && (
              <span className="ml-1 text-xs text-slate-500">
                ({placement.onsiteManagerEmail})
              </span>
            )}
          </SummaryItem>
        </dl>
      </Card>

      <ExtensionHistory
        placementId={placement.id}
        extensions={placement.extensions}
        currentEnd={placement.endDate}
        canManageRates={canManageRates}
        canExtend={canExtend}
      />

      {(placement.status === "ENDED" || placement.status === "TERMINATED") && (
        <Card title="End-of-placement">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryItem label="End date">
              {placement.endDate ? formatDate(placement.endDate) : "—"}
            </SummaryItem>
            <SummaryItem label="Reason">
              {placement.endReason
                ? PLACEMENT_END_REASON_LABEL[placement.endReason]
                : "—"}
            </SummaryItem>
            {placement.endNote && (
              <div className="sm:col-span-2">
                <SummaryItem label="Note">{placement.endNote}</SummaryItem>
              </div>
            )}
            {placement.replacementSubmission && (
              <div className="sm:col-span-2">
                <SummaryItem label="Replacement">
                  <Link
                    href={`/submissions/${placement.replacementSubmission.id}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {formatSubmissionDisplayId(placement.replacementSubmission)} —{" "}
                    {placement.replacementSubmission.candidate.fullName}
                  </Link>
                </SummaryItem>
              </div>
            )}
          </dl>
        </Card>
      )}

      <ActivityTimeline entries={timeline} />
    </div>
  );
}
