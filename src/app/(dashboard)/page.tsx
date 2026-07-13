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
import { getCurrentUser, getScopedPrisma } from "@/lib/session";
import {
  hasFullAccess,
  isManagerTier,
  canViewSensitiveDocs,
} from "@/lib/permissions";
import {
  getDashboardData,
  getMyRecentActivity,
  getOnboardingStatus,
  type MyRecentActivity,
} from "@/server/queries/dashboard";
import { leadsAnyTeam, ledTeamMemberIds } from "@/server/team-lead";
import {
  getPendingTodos,
  getManagerActionItems,
  getTeamRollup,
  groupByUrgency,
  type TodoItem,
} from "@/server/pending";
import {
  PendingTodos,
  MemberCountStrip,
} from "@/components/dashboard/pending-todos";
import { TeamRollupCards } from "@/components/dashboard/team-rollup";
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

type Scope = "me" | "team" | "org";

const SCOPE_LABEL: Record<Scope, string> = {
  me: "My work",
  team: "My team",
  org: "Org-wide",
};

/** Switches the dashboard between the acting user's queue, their team (leads),
 *  and the org view (managers). Preserves all other filter params; only
 *  `?scope=` changes. `scopes` is the set available to this viewer. */
function ScopeToggle({
  scope,
  scopes,
  sp,
}: {
  scope: Scope;
  scopes: Scope[];
  sp: { [key: string]: string | string[] | undefined };
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k === "scope") continue;
    if (Array.isArray(v)) v.forEach((x) => x && params.append(k, x));
    else params.set(k, v);
  }
  const hrefFor = (next: Scope) => {
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
      {scopes.map((s) => (
        <Link
          key={s}
          role="tab"
          aria-selected={scope === s}
          href={hrefFor(s)}
          className={`${base} ${scope === s ? on : off}`}
        >
          {SCOPE_LABEL[s]}
        </Link>
      ))}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { filters } = parseAnalyticsParams(sp);
  const user = await getCurrentUser();

  // Dashboard tiers: Managers get the org-wide view; team leads get a "My team"
  // rollup; plain recruiters see only their own queue. `?scope=` can only reach
  // a scope the viewer is entitled to. `me`/`team` drive the unified pending-todo
  // view; `org` still drives the legacy manager card (redesigned in PR-B).
  const isManager = isManagerTier(user);
  const db = await getScopedPrisma();
  const isLead = !isManager && user ? await leadsAnyTeam(db, user.id) : false;
  const availableScopes: Scope[] = isManager
    ? ["me", "org"]
    : isLead
      ? ["me", "team"]
      : ["me"];
  const requested = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope;
  const scope: Scope =
    requested && availableScopes.includes(requested as Scope)
      ? (requested as Scope)
      : isManager
        ? "org"
        : "me";

  const memberIds =
    scope === "team" && user ? await ledTeamMemberIds(db, user.id) : [];
  const todoUserIds = scope === "team" ? memberIds : user ? [user.id] : [];
  const isTaskScope = scope === "me" || scope === "team";

  const effectiveFilters =
    scope === "me" && user
      ? { ...filters, recruiterId: [user.id] }
      : scope === "team"
        ? { ...filters, recruiterId: memberIds }
        : filters;

  const [
    data,
    recentActivity,
    clients,
    vendors,
    sources,
    recruiters,
    onboarding,
    todos,
    teamMembers,
    managerActionItems,
    teamRollup,
  ] = await Promise.all([
    getDashboardData(effectiveFilters),
    // Recent activity feed replaces the org-wide recruiter table in "My work".
    scope === "me" && user
      ? getMyRecentActivity(user.id)
      : Promise.resolve([] as MyRecentActivity),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listActiveRecruiterOptions(),
    getOnboardingStatus(),
    // Unified pending todos for the me/team task view.
    isTaskScope && user
      ? getPendingTodos(db, todoUserIds, { canSensitive: canViewSensitiveDocs(user) })
      : Promise.resolve([] as TodoItem[]),
    scope === "team"
      ? db.user.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([] as { id: string; fullName: string }[]),
    // Manager-only action items, folded into their own "My work" tiers.
    scope === "me" && user && hasFullAccess(user)
      ? getManagerActionItems(db)
      : Promise.resolve([] as TodoItem[]),
    // Manager org oversight — per-team rollup + top-urgent items.
    scope === "org" && user
      ? getTeamRollup(db, { canSensitive: canViewSensitiveDocs(user) })
      : Promise.resolve({ teams: [], topUrgent: [] as TodoItem[] }),
  ]);

  const grouped = groupByUrgency([...todos, ...managerActionItems]);
  // Team per-member counts (worst-first), for the "who's drowning" strip.
  const memberCounts =
    scope === "team" && user
      ? (() => {
          const byOwner = new Map<string, number>();
          for (const t of todos)
            byOwner.set(t.ownerId, (byOwner.get(t.ownerId) ?? 0) + 1);
          return teamMembers
            .map((m) => ({
              id: m.id,
              name: m.fullName,
              count: byOwner.get(m.id) ?? 0,
              isSelf: m.id === user.id,
            }))
            .sort((a, b) => b.count - a.count);
        })()
      : [];

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
            {isManager ? "Dashboard" : scope === "team" ? "My Team" : "My Work"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back{user ? `, ${user.fullName}` : ""}.{" "}
            {scope === "me"
              ? "Your work — only submissions and jobs you own."
              : scope === "team"
                ? "Your team's pending work, across everyone you lead."
                : "Org-wide recruiting overview."}
          </p>
        </div>
        {availableScopes.length > 1 && (
          <ScopeToggle scope={scope} scopes={availableScopes} sp={sp} />
        )}
      </div>

      {!onboarding.hasSubmissions && (
        <OnboardingChecklist
          status={onboarding}
          isAdmin={hasFullAccess(user)}
        />
      )}

      {isTaskScope ? (
        <Card title="Needs attention">
          {scope === "team" && memberCounts.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs text-slate-500">
                Open items by team member — who needs a hand:
              </p>
              <MemberCountStrip members={memberCounts} />
            </div>
          )}
          <PendingTodos grouped={grouped} showOwner={scope === "team"} />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card title="Teams — most behind first">
            <TeamRollupCards teams={teamRollup.teams} />
          </Card>
          {teamRollup.topUrgent.length > 0 && (
            <Card title="Org-wide, needs action now">
              <PendingTodos
                grouped={groupByUrgency(teamRollup.topUrgent)}
                showOwner
              />
            </Card>
          )}
        </div>
      )}

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
