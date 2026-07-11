import Link from "next/link";
import { ScrollText, FileDown } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, canGrantManagerRole, canManageRoles } from "@/lib/permissions";
import { RolesSection } from "@/components/settings/roles-section";
import { listRoles, listRoleOptions } from "@/server/queries/roles";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import {
  listSisterCompanies,
  listClients,
  listVendors,
  listUsers,
  listActiveUserOptions,
  listTeamsAdmin,
  listTeamLeadOptions,
} from "@/server/queries/org";
import { saveSisterCompany, saveVendor } from "@/server/actions/org";
import { TeamSection } from "@/components/settings/team-section";
import { listSupportProviders } from "@/server/queries/support";
import { ContactOrgSection } from "@/components/settings/contact-org-section";
import { SupportSection } from "@/components/settings/support-section";
import { ClientSection } from "@/components/settings/client-section";
import { UserSection } from "@/components/settings/user-section";
import { AccountSection } from "@/components/settings/account-section";
import { DeletedCandidatesSection } from "@/components/settings/deleted-candidates-section";
import { DeletedJobsSection } from "@/components/settings/deleted-jobs-section";
import { GlossarySection } from "@/components/settings/glossary-section";
import { AdminToolsDisclosure } from "@/components/settings/admin-tools-disclosure";
import { Forbidden } from "@/components/ui/forbidden";
import { listCandidateArchives } from "@/server/queries/candidate-archives";
import { listJobArchives } from "@/server/queries/job-archives";
import { getGlossaryWithNotes } from "@/server/queries/glossary";

const TABS = [
  { key: "sister-companies", label: "Sources" },
  { key: "clients", label: "Clients" },
  { key: "vendors", label: "Vendors" },
  { key: "support", label: "Support" },
  { key: "teams", label: "Teams" },
  { key: "users", label: "Users" },
  { key: "roles", label: "Roles" },
  { key: "glossary", label: "Glossary" },
  { key: "deleted", label: "Erased backups", adminOnly: true },
  { key: "account", label: "My account" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const isAdmin = isManagerTier(user);
  const canGrantManager = canGrantManagerRole(user);

  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  // Only managers get the management tabs. Everyone else is limited to their own
  // account (reached via the user-menu "Change password" link) — a `?tab=users`
  // URL from a restricted user still lands on account.
  const tab: TabKey = !isAdmin
    ? "account"
    : TABS.some((t) => t.key === rawTab)
      ? (rawTab as TabKey)
      : "sister-companies";

  let content: React.ReactNode;
  if (tab === "sister-companies") {
    content = (
      <ContactOrgSection
        title="Sources"
        singular="source"
        items={await listSisterCompanies()}
        action={saveSisterCompany}
        contactKind="source"
        isAdmin={isAdmin}
      />
    );
  } else if (tab === "clients") {
    content = (
      <ClientSection items={await listClients()} isAdmin={isAdmin} />
    );
  } else if (tab === "vendors") {
    const [vendors, userOptions] = await Promise.all([
      listVendors(),
      listActiveUserOptions(),
    ]);
    content = (
      <ContactOrgSection
        title="Vendors"
        singular="vendor"
        items={vendors}
        action={saveVendor}
        contactKind="vendor"
        isAdmin={isAdmin}
        showRecruitedBy
        userNames={userOptions.map((u) => u.fullName)}
      />
    );
  } else if (tab === "support") {
    content = (
      <SupportSection items={await listSupportProviders()} isAdmin={isAdmin} />
    );
  } else if (tab === "teams") {
    const [teams, leadOptions] = await Promise.all([
      listTeamsAdmin(),
      listTeamLeadOptions(),
    ]);
    content = (
      <TeamSection items={teams} canManage={isAdmin} leadOptions={leadOptions} />
    );
  } else if (tab === "users") {
    // All teams (incl. empty ones) so a new team is immediately assignable.
    const [users, allTeams, userOptions, roleOptions] = await Promise.all([
      listUsers(),
      listTeamsAdmin(),
      listActiveUserOptions(),
      listRoleOptions(),
    ]);
    content = (
      <UserSection
        items={users.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          roleId: u.roleId,
          roleName: u.assignedRole?.name ?? null,
          isActive: u.isActive,
          showInOrgChart: u.showInOrgChart,
          teamId: u.teamId,
          teamName: u.team?.name ?? null,
          reportsToId: u.reportsToId,
        }))}
        canManage={isAdmin}
        canGrantManager={canGrantManager}
        teams={allTeams.map((t) => ({ id: t.id, name: t.name }))}
        userOptions={userOptions}
        roleOptions={roleOptions}
      />
    );
  } else if (tab === "roles") {
    content = (
      <RolesSection roles={await listRoles()} canManage={canManageRoles(user)} />
    );
  } else if (tab === "glossary") {
    content = (
      <GlossarySection rows={await getGlossaryWithNotes()} isAdmin={isAdmin} />
    );
  } else if (tab === "deleted") {
    if (isAdmin) {
      const [candidateArchives, jobArchives] = await Promise.all([
        listCandidateArchives(),
        listJobArchives(),
      ]);
      content = (
        <div className="space-y-8">
          <DeletedCandidatesSection archives={candidateArchives} />
          <DeletedJobsSection archives={jobArchives} />
        </div>
      );
    } else {
      content = <Forbidden />;
    }
  } else {
    content = (
      <AccountSection
        fullName={user?.fullName ?? ""}
        email={user?.email ?? ""}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? "Manage sources, clients, vendors, and app users."
            : "Your account."
        }
      />

      {isAdmin && (
        <AdminToolsDisclosure>
          <p className="mb-3 text-xs text-slate-500">
            The org-wide audit log and data export.
          </p>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/audit" variant="secondary">
              <ScrollText className="h-4 w-4" />
              Audit log
            </LinkButton>
            <LinkButton href="/settings/export" variant="secondary">
              <FileDown className="h-4 w-4" />
              Export data
            </LinkButton>
          </div>
        </AdminToolsDisclosure>
      )}

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 border-b border-slate-200"
      >
        {TABS.filter((t) =>
          isAdmin ? true : t.key === "account",
        ).map((t) => {
          const selected = t.key === tab;
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={selected}
              aria-current={selected ? "page" : undefined}
              href={`/settings?tab=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
                selected
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {content}
    </div>
  );
}
