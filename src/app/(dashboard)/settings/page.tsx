import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
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
      />
    );
  } else if (tab === "clients") {
    content = <ClientSection items={await listClients()} />;
  } else if (tab === "vendors") {
    content = (
      <ContactOrgSection
        title="Vendors"
        singular="vendor"
        items={await listVendors()}
        action={saveVendor}
      />
    );
  } else {
    content = <UserSection items={await listUsers()} canManage={isAdmin} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description="Manage sources, clients, vendors, and app users."
      />

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/settings?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
              t.key === tab
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {content}
    </div>
  );
}
