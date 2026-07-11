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
import { hasFullAccess, isManagerTier } from "@/lib/permissions";
import {
  getDashboardData,
  getMyWork,
  getMyAssignedJobs,
  getMyRecentActivity,
  getMissingResumeSubmissions,
  getOnboardingStatus,
  type MyRecentActivity,
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
import { parseAnalyticsParams } from "@/lib/analytics";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { StatCard } from "@/components/dashboard/stat-card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { MyWorkList } from "@/components/dashboard/needs-attention-list";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { current, filters } = parseAnalyticsParams(sp);
  const user = await getCurrentUser();

  // Dashboard tiers: only Managers get the org-wide analytics view (and the
  // toggle to reach it). The restricted tier (recruiter + team lead) is locked
  // to their personal "My Work" task view — a `?scope=org` URL won't flip them.
  // When scope === "me" we force `recruiterId` to the acting user (overrides any
  // explicit recruiter filter from the bar).
  const isManager = isManagerTier(user);
  const scope: "me" | "org" = isManager ? (current.scope ?? "org") : "me";
  const effectiveFilters =
    scope === "me" && user ? { ...filters, recruiterId: [user.id] } : filters;

  const [
    data,
    myWork,
    myAssignedJobs,
    recentActivity,
    expiringDocs,
    ratesPendingPlacements,
    missingResumeSubs,
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
    // "My jobs" mini-list — see below.
    scope === "me" && user
      ? getMyAssignedJobs(user.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof getMyAssignedJobs>>),
    // Recent activity feed replaces the org-wide recruiter table in "My work".
    scope === "me" && user
      ? getMyRecentActivity(user.id)
      : Promise.resolve([] as MyRecentActivity),
    user
      ? getExpiringDocuments(user, { scope, withinDays: 30 })
      : Promise.resolve([]),
    // Rates-pending only matters to admins (they own the close-out). On the
    // "me" scope or for recruiters this list is hidden — keeps the card tight.
    user && hasFullAccess(user) && scope === "org"
      ? getRatesPendingPlacements({ limit: 5 })
      : Promise.resolve([]),
    user
      ? getMissingResumeSubmissions({ scope, userId: user.id, limit: 8 })
      : Promise.resolve([]),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listActiveRecruiterOptions(),
    getOnboardingStatus(),
  ]);

  // KPI tiles link to their filtered list. In "My work" the link also scopes to
  // the acting user (status + scope only — the bar's other filters aren't carried).
  const meId = scope === "me" && user ? user.id : undefined;
  const listHref = (
    base: string,
    params: Record<string, string | undefined>,
  ) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, recruiterId: meId }))
      if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isManager ? "Dashboard" : "My Work"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back{user ? `, ${user.fullName}` : ""}.{" "}
            {scope === "me"
              ? "Your work — only submissions and jobs you own."
              : "Org-wide recruiting overview."}
          </p>
        </div>
        {isManager && <ScopeToggle scope={scope} sp={sp} />}
      </div>

      {!onboarding.hasSubmissions && (
        <OnboardingChecklist
          status={onboarding}
          isAdmin={hasFullAccess(user)}
        />
      )}

      {(scope === "me" &&
        (myWork.staleSubmissions.length > 0 ||
          myWork.pendingRounds.length > 0 ||
          myWork.pendingRequirements.length > 0 ||
          myAssignedJobs.length > 0)) ||
      expiringDocs.length > 0 ||
      ratesPendingPlacements.length > 0 ||
      missingResumeSubs.length > 0 ? (
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
              items={expiringDocs.map((d) => {
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
            {missingResumeSubs.length > 0 && (
              <MyWorkList
                heading={`Submissions missing a résumé (${missingResumeSubs.length})`}
                empty="No submissions missing a résumé."
                footer={{
                  href: listHref("/submissions", { missingResume: "1" }),
                  label: "View all →",
                }}
                items={missingResumeSubs.map((s) => ({
                  href: `/submissions/${s.id}`,
                  primary: `${s.candidate.fullName} → ${s.job.title}`,
                  secondary: `${formatSubmissionDisplayId(s)} · submitted ${formatDate(s.submittedAt)}${scope === "org" ? ` · ${s.submittedBy.fullName}` : ""}`,
                }))}
              />
            )}
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
          href={listHref("/jobs", { status: "OPEN" })}
          value={data.activeJobs}
          icon={Briefcase}
          tone="green"
          hint={`${data.openJobs} open · ${data.onHoldJobs} on hold`}
          tooltip="Counts only OPEN/ON_HOLD jobs with at least one assigned recruiter. Unowned bulk-imported jobs are excluded. Honors the filters above."
        />
        <StatCard
          label="Total submissions"
          href={listHref("/submissions", {})}
          value={data.totalSubmissions}
          icon={Send}
          tone="indigo"
          tooltip="All submissions in the filter window, regardless of status."
        />
        <StatCard
          label="Interview rounds"
          href="/interviews"
          value={data.interviewCount}
          icon={CalendarCheck}
          tone="blue"
          tooltip="Total interview rounds across all in-window submissions. (Reports counts distinct candidates who reached an interview, so that figure is lower.)"
        />
        <StatCard
          label="Selected"
          href={listHref("/submissions", { status: "SELECTED" })}
          value={data.selected}
          icon={CircleCheck}
          tone="green"
          tooltip="Submissions whose current status is Selected."
        />
        <StatCard
          label="Offers released"
          href={listHref("/submissions", { status: "OFFER_RELEASED" })}
          value={data.offerReleased}
          icon={FileText}
          tone="indigo"
          tooltip="Submissions whose current status is Offer Released."
        />
        <StatCard
          label="Joined"
          href={listHref("/submissions", { status: "JOINED" })}
          value={data.joined}
          icon={UserCheck}
          tone="green"
          tooltip="Submissions whose current status is Joined."
        />
        <StatCard
          label="Rejected"
          href={listHref("/submissions", { status: "REJECTED" })}
          value={data.rejected}
          icon={CircleX}
          tone="red"
          tooltip="Submissions whose current status is Rejected."
        />
        <StatCard
          label="On hold"
          href={listHref("/submissions", { status: "ON_HOLD" })}
          value={data.onHold}
          icon={CirclePause}
          tone="amber"
          tooltip="Submissions whose current status is On Hold."
        />
      </div>

      {scope === "org" ? (
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
      ) : (
        <RecentActivityCard items={recentActivity} />
      )}
    </div>
  );
}
