import Link from "next/link";
import { Download, History, ScrollText, FileDown } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import {
  listSisterCompanies,
  listClients,
  listVendors,
  listUsers,
} from "@/server/queries/org";
import { saveSisterCompany, saveVendor } from "@/server/actions/org";
import { ContactOrgSection } from "@/components/settings/contact-org-section";
import { ClientSection } from "@/components/settings/client-section";
import { UserSection } from "@/components/settings/user-section";

const TABS = [
  { key: "sister-companies", label: "Sources" },
  { key: "clients", label: "Clients" },
  { key: "vendors", label: "Vendors" },
  { key: "users", label: "Users" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabKey = TABS.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : "sister-companies";

  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";

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
    content = (
      <ContactOrgSection
        title="Vendors"
        singular="vendor"
        items={await listVendors()}
        action={saveVendor}
        contactKind="vendor"
        isAdmin={isAdmin}
      />
    );
  } else {
    content = <UserSection items={await listUsers()} canManage={isAdmin} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? "Manage sources, clients, vendors, and app users."
            : "Reference data — sources, clients, vendors, and team (read-only)."
        }
      />

      {isAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">
            Admin tools
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Bulk iLabor requisition imports and their history.
          </p>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/jobs/import" variant="secondary">
              <Download className="h-4 w-4" />
              Import from iLabor
            </LinkButton>
            <LinkButton href="/jobs/imports" variant="secondary">
              <History className="h-4 w-4" />
              Import history
            </LinkButton>
            <LinkButton href="/audit" variant="secondary">
              <ScrollText className="h-4 w-4" />
              Audit log
            </LinkButton>
            <LinkButton href="/settings/export" variant="secondary">
              <FileDown className="h-4 w-4" />
              Export data
            </LinkButton>
          </div>
        </section>
      )}

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 border-b border-slate-200"
      >
        {TABS.map((t) => {
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
