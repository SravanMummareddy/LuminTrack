import Link from "next/link";
import {
  Briefcase,
  Send,
  CalendarCheck,
  CircleCheck,
  FileText,
  UserCheck,
  CircleX,
  CirclePause,
} from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import {
  getDashboardData,
  getMyWork,
  getMyAssignedJobs,
  getOnboardingStatus,
} from "@/server/queries/dashboard";
import { getExpiringDocuments } from "@/server/queries/candidates";
import { getRatesPendingPlacements } from "@/server/queries/placements";
import {
  formatDate,
  formatJobDisplayId,
  formatPlacementDisplayId,
  formatSubmissionDisplayId,
  formatVendorRequirementDisplayId,
} from "@/lib/format";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listActiveRecruiterOptions,
} from "@/server/queries/org";
import { parseAnalyticsParams, TONE_HEX } from "@/lib/analytics";
import {
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { StatCard } from "@/components/dashboard/stat-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { BarChartCard } from "@/components/dashboard/charts";
import { Table, Th, Td, cardLink } from "@/components/ui/table";

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white p-5 ${className ?? ""}`}
    >
      <h2 className="mb-4 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

/** Switches the dashboard between the acting user's queue and the org view.
 *  Preserves all other filter params; only `?scope=` changes. */
function ScopeToggle({
  scope,
  sp,
}: {
  scope: "me" | "org";
  sp: { [key: string]: string | string[] | undefined };
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k === "scope") continue;
    if (Array.isArray(v)) v.forEach((x) => x && params.append(k, x));
    else params.set(k, v);
  }
  const hrefFor = (next: "me" | "org") => {
    const copy = new URLSearchParams(params);
    copy.set("scope", next);
    return `/?${copy.toString()}`;
  };
  const base =
    "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition";
  const on = "bg-indigo-600 text-white";
  const off = "bg-white text-slate-600 hover:bg-slate-50";
  return (
    <div
      role="tablist"
      aria-label="Dashboard scope"
      className="inline-flex rounded-md border border-slate-300 p-0.5"
    >
      <Link
        role="tab"
        aria-selected={scope === "me"}
        href={hrefFor("me")}
        className={`${base} ${scope === "me" ? on : off}`}
      >
        My work
      </Link>
      <Link
        role="tab"
        aria-selected={scope === "org"}
        href={hrefFor("org")}
        className={`${base} ${scope === "org" ? on : off}`}
      >
        Org-wide
      </Link>
    </div>
  );
}

function MyWorkList({
  heading,
  empty,
  items,
  footer,
}: {
  heading: string;
  empty: string;
  items: { href: string; primary: string; secondary: string }[];
  /** Optional "View all" link rendered below the list when items are present. */
  footer?: { href: string; label: string };
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {heading}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
          {empty}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {items.map((it, i) => (
              <li key={i}>
                <Link
                  href={it.href}
                  className="block px-3 py-2 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
                >
                  <span className="block truncate text-sm text-slate-800">
                    {it.primary}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {it.secondary}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {footer && (
            <div className="mt-2 text-right text-xs">
              <Link
                href={footer.href}
                className="text-indigo-600 hover:underline"
              >
                {footer.label}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);
  const user = await getCurrentUser();

  // Default scope: non-admin recruiters land on "me" so they see their own
  // queue at standup; admins default to "org". A `?scope=` URL toggle lets
  // either user flip. When scope === "me" we force `recruiterId` to the
  // acting user (overrides any explicit recruiter filter from the bar).
  const scope: "me" | "org" =
    current.scope ?? (user?.role === "ADMIN" ? "org" : "me");
  const effectiveFilters =
    scope === "me" && user ? { ...filters, recruiterId: [user.id] } : filters;

  const [
    data,
    myWork,
    myAssignedJobs,
    expiringDocs,
    ratesPendingPlacements,
    clients,
    vendors,
    sources,
    recruiters,
    onboarding,
  ] = await Promise.all([
    getDashboardData(effectiveFilters),
    scope === "me" && user
      ? getMyWork(user.id)
      : Promise.resolve({
          staleSubmissions: [],
          pendingRounds: [],
          pendingRequirements: [],
        }),
    // "My jobs" mini-list — only relevant when the recruiter is viewing
    // their own scope. Admins on scope=org don't see this card.
    scope === "me" && user
      ? getMyAssignedJobs(user.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof getMyAssignedJobs>>),
    user
      ? getExpiringDocuments(user, { scope, withinDays: 30 })
      : Promise.resolve([]),
    // Rates-pending only matters to admins (they own the close-out). On the
    // "me" scope or for recruiters this list is hidden — keeps the card tight.
    user && user.role === "ADMIN" && scope === "org"
      ? getRatesPendingPlacements({ limit: 5 })
      : Promise.resolve([]),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listActiveRecruiterOptions(),
    getOnboardingStatus(),
  ]);

  const submissionsByStageChart = data.submissionsByStatus.map((d) => ({
    label: SUBMISSION_STATUS_LABEL[d.status],
    value: d.count,
    color: TONE_HEX[SUBMISSION_STATUS_TONE[d.status]],
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back{user ? `, ${user.fullName}` : ""}.{" "}
            {scope === "me"
              ? "Your work — only submissions and jobs you own."
              : "Org-wide recruiting overview."}
          </p>
        </div>
        <ScopeToggle scope={scope} sp={sp} />
      </div>

      {!onboarding.hasSubmissions && (
        <OnboardingChecklist
          status={onboarding}
          isAdmin={user?.role === "ADMIN"}
        />
      )}

      {(scope === "me" &&
        (myWork.staleSubmissions.length > 0 ||
          myWork.pendingRounds.length > 0 ||
          myWork.pendingRequirements.length > 0 ||
          myAssignedJobs.length > 0)) ||
      expiringDocs.length > 0 ||
      ratesPendingPlacements.length > 0 ? (
        <Card title="Needs attention">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scope === "me" && (
              <>
                <MyWorkList
                  heading={`My active jobs (${myAssignedJobs.length})`}
                  empty="No active jobs assigned to you."
                  footer={
                    user
                      ? {
                          href: `/jobs?recruiterId=${user.id}&status=OPEN`,
                          label: "View all my jobs →",
                        }
                      : undefined
                  }
                  items={myAssignedJobs.map((a) => ({
                    href: `/jobs/${a.job.id}`,
                    primary: `${formatJobDisplayId(a.job)} · ${a.job.title}`,
                    secondary: `${a.job.client.name} · ${a.job._count.submissions} sub${a.job._count.submissions === 1 ? "" : "s"} · assigned ${a.ageDays}d ago`,
                  }))}
                />
                <MyWorkList
                  heading={`Submissions waiting >7 days (${myWork.staleSubmissions.length})`}
                  empty="No stale submissions — nice."
                  items={myWork.staleSubmissions.map((s) => ({
                    href: `/submissions/${s.id}`,
                    primary: `${s.candidate.fullName} → ${s.job.title}`,
                    secondary: `${formatSubmissionDisplayId(s)} · submitted ${formatDate(s.submittedAt)}`,
                  }))}
                />
                <MyWorkList
                  heading={`Interview rounds awaiting result (${myWork.pendingRounds.length})`}
                  empty="No rounds waiting on you."
                  items={myWork.pendingRounds.map((r) => ({
                    href: `/submissions/${r.submission.id}`,
                    primary: `${r.submission.candidate.fullName} · R${r.roundOrder}`,
                    secondary: `${r.submission.job.title} · ${r.scheduledAt ? formatDate(r.scheduledAt) : "no date"}`,
                  }))}
                />
                <MyWorkList
                  heading={`Requirements to move (${myWork.pendingRequirements.length})`}
                  empty="No vendor requirements waiting on you."
                  items={myWork.pendingRequirements.map((r) => ({
                    href: `/vendor-portal/${r.id}`,
                    primary: `${formatVendorRequirementDisplayId(r)} · ${r.job.title}`,
                    secondary: r.candidate
                      ? `${r.candidate.fullName} — ready to move to a submission`
                      : "No candidate yet",
                  }))}
                />
              </>
            )}
            <MyWorkList
              heading={`Documents expiring (30 days) (${expiringDocs.length})`}
              empty="No documents expiring in the next 30 days."
              items={expiringDocs.slice(0, 5).map((d) => {
                const days = d.daysUntilExpiry ?? 0;
                const status =
                  days < 0 ? "Expired" : days < 1 ? "Expires today" : `${days}d left`;
                return {
                  href: `/candidates/${d.candidate.id}`,
                  primary: `${d.candidate.fullName} · ${d.label}`,
                  secondary: `${d.category.replace("_", " ").toLowerCase()} · ${status}`,
                };
              })}
            />
            {ratesPendingPlacements.length > 0 && (
              <MyWorkList
                heading={`Placements with rates pending (${ratesPendingPlacements.length})`}
                empty="No placements waiting on rates."
                items={ratesPendingPlacements.map((p) => ({
                  href: `/placements/${p.id}`,
                  primary: `${p.candidate.fullName} · ${p.job.title}`,
                  secondary: `${formatPlacementDisplayId(p)} · since ${formatDate(p.startDate)}`,
                }))}
              />
            )}
          </div>
        </Card>
      ) : null}

      <AnalyticsFilters
        basePath="/"
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active jobs"
          value={data.activeJobs}
          icon={Briefcase}
          tone="green"
          hint={`${data.openJobs} open · ${data.onHoldJobs} on hold`}
          tooltip="Counts only OPEN/ON_HOLD jobs with at least one assigned recruiter. Unowned bulk-imported jobs are excluded. Honors the filters above."
        />
        <StatCard
          label="Total submissions"
          value={data.totalSubmissions}
          icon={Send}
          tone="indigo"
          tooltip="All submissions in the filter window, regardless of status."
        />
        <StatCard
          label="Interview rounds"
          value={data.interviewCount}
          icon={CalendarCheck}
          tone="blue"
          tooltip="Total interview rounds across all in-window submissions. (Reports counts distinct candidates who reached an interview, so that figure is lower.)"
        />
        <StatCard
          label="Selected"
          value={data.selected}
          icon={CircleCheck}
          tone="green"
          tooltip="Submissions whose current status is Selected."
        />
        <StatCard
          label="Offers released"
          value={data.offerReleased}
          icon={FileText}
          tone="indigo"
          tooltip="Submissions whose current status is Offer Released."
        />
        <StatCard
          label="Joined"
          value={data.joined}
          icon={UserCheck}
          tone="green"
          tooltip="Submissions whose current status is Joined."
        />
        <StatCard
          label="Rejected"
          value={data.rejected}
          icon={CircleX}
          tone="red"
          tooltip="Submissions whose current status is Rejected."
        />
        <StatCard
          label="On hold"
          value={data.onHold}
          icon={CirclePause}
          tone="amber"
          tooltip="Submissions whose current status is On Hold."
        />
      </div>

      <Card title="Submissions by pipeline stage">
        <BarChartCard data={submissionsByStageChart} height={320} />
      </Card>

      <Card title="Recruiter performance">
        {data.recruiterPerf.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No recruiter submissions for the selected filters.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Recruiter</Th>
                <Th className="text-right">Submissions</Th>
                <Th className="text-right">Interviews</Th>
                <Th className="text-right">Selected</Th>
                <Th className="text-right">Joined</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recruiterPerf.map((r) => {
                const dash = (n: number) =>
                  n === 0 ? <span className="text-slate-300">—</span> : n;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td heading>
                      <Link
                        href={`/recruiters/${r.id}`}
                        className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                      >
                        {r.fullName}
                      </Link>
                    </Td>
                    <Td label="Submissions" className="text-right tabular-nums">
                      {dash(r.submissions)}
                    </Td>
                    <Td
                      label="Interviews"
                      secondary
                      className="text-right tabular-nums"
                    >
                      {dash(r.interviews)}
                    </Td>
                    <Td
                      label="Selected"
                      secondary
                      className="text-right tabular-nums"
                    >
                      {dash(r.selected)}
                    </Td>
                    <Td label="Joined" className="text-right tabular-nums">
                      {dash(r.joined)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
