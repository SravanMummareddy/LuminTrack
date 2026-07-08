import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ActivityTimeline } from "@/components/timeline/activity-timeline";
import { BenchCredentials } from "@/components/bench/bench-credentials";
import { getBenchConsultant } from "@/server/queries/bench-consultants";
import {
  removeFromBench,
  remarketConsultant,
} from "@/server/actions/bench-consultants";
import { getTimelineFor } from "@/server/queries/timeline";
import {
  BENCH_PRIORITY_LABEL,
  BENCH_PRIORITY_TONE,
  BENCH_MARKETING_STATUS_LABEL,
  BENCH_MARKETING_STATUS_TONE,
} from "@/lib/labels";
import {
  formatBenchConsultantDisplayId,
  formatCandidateDisplayId,
  formatDate,
  formatRate,
} from "@/lib/format";
import { requireUser } from "@/lib/session";
import { canViewBenchCredentials } from "@/lib/permissions";

function years(n: { toString(): string } | null): string {
  return n === null ? "—" : `${n.toString()} yrs`;
}

export default async function BenchConsultantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const canCreds = canViewBenchCredentials(user);
  const c = await getBenchConsultant(id, { includeCredentials: canCreds });
  if (!c) notFound();

  const timeline = await getTimelineFor("CONSULTANT", id);

  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Technology", value: c.candidate?.technology ?? "—" },
    { label: "M Visa", value: c.mVisa ?? "—" },
    { label: "A Visa", value: c.aVisa ?? "—" },
    { label: "Work authorization", value: c.workAuthorization ?? "—" },
    { label: "Marketing experience", value: years(c.marketingExpYears) },
    { label: "Real-time experience", value: years(c.realTimeExpYears) },
    { label: "Current location", value: c.currentLocation ?? "—" },
    { label: "Relocation", value: c.relocation ? "Yes" : "No" },
    { label: "Least rate on C2C", value: formatRate(c.leastRateC2C) },
    { label: "Call type", value: c.callType ?? "—" },
    { label: "Payroll type", value: c.payrollType ?? "—" },
    { label: "Project type", value: c.projectType ?? "—" },
    { label: "Company", value: c.company ?? "—" },
    { label: "Reference", value: c.reference ?? "—" },
    {
      label: "Marketing start",
      value: c.marketingStartDate ? formatDate(c.marketingStartDate) : "—",
    },
    { label: "Marketing recruiter", value: c.recruiter?.fullName ?? "—" },
    { label: "Contact email", value: c.email ?? "—" },
    { label: "Contact phone", value: c.phone ?? "—" },
    { label: "Skills", value: c.skills.length ? c.skills.join(", ") : "—" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/bench"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bench
      </Link>
      <PageHeader title={c.fullName} description={formatBenchConsultantDisplayId(c)}>
        <Link href={`/bench/${c.id}/edit`} className={buttonClass("secondary")}>
          Edit
        </Link>
        {(c.marketingStatus === "ACTIVE" || c.marketingStatus === "PAUSED") && (
          <form action={removeFromBench}>
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className={buttonClass("danger")}>
              Remove from bench
            </button>
          </form>
        )}
        {c.marketingStatus === "PLACED" && (
          <form action={remarketConsultant}>
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className={buttonClass("secondary")}>
              Market — project ending
            </button>
          </form>
        )}
        {c.marketingStatus === "INACTIVE" && (
          <form action={remarketConsultant}>
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className={buttonClass("primary")}>
              Add back to bench
            </button>
          </form>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={BENCH_PRIORITY_TONE[c.priority]}>
          {BENCH_PRIORITY_LABEL[c.priority]}
        </Badge>
        <Badge tone={BENCH_MARKETING_STATUS_TONE[c.marketingStatus]}>
          {BENCH_MARKETING_STATUS_LABEL[c.marketingStatus]}
        </Badge>
        {c.candidate ? (
          <Link
            href={`/candidates/${c.candidate.id}`}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Linked to candidate {formatCandidateDisplayId(c.candidate)}
          </Link>
        ) : (
          <span className="text-sm text-slate-400">No linked candidate</span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{d.label}</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{d.value}</dd>
            </div>
          ))}
        </dl>
        {c.notes && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <dt className="text-xs uppercase tracking-wide text-slate-500">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.notes}</dd>
          </div>
        )}
      </div>

      {canCreds && (
        <BenchCredentials
          marketingEmail={c.marketingEmail}
          marketingPassword={c.marketingPassword ?? null}
          marketingNumber={c.marketingNumber}
          personalNumber={c.personalNumber}
        />
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Activity</h2>
        <ActivityTimeline entries={timeline} />
      </div>
    </div>
  );
}
