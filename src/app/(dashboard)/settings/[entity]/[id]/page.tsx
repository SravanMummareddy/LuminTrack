import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { Forbidden } from "@/components/ui/forbidden";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EntityContacts } from "@/components/settings/entity-contacts";
import { getOrgEntityDetail, type OrgEntityKind } from "@/server/queries/org";
import {
  formatClientDisplayId,
  formatVendorDisplayId,
  formatSourceDisplayId,
  formatReferrerDisplayId,
  formatJobDisplayId,
  formatDate,
} from "@/lib/format";
import { JOB_STATUS_LABEL } from "@/lib/labels";
import type { ContactKind } from "@/lib/contact-kinds";

const META: Record<
  OrgEntityKind,
  { label: string; tab: string; displayId: (e: { seq: number }) => string; contactKind: ContactKind | null }
> = {
  client: { label: "Client", tab: "clients", displayId: formatClientDisplayId, contactKind: "client" },
  vendor: { label: "Vendor", tab: "vendors", displayId: formatVendorDisplayId, contactKind: "vendor" },
  source: { label: "Source", tab: "sister-companies", displayId: formatSourceDisplayId, contactKind: "source" },
  referrer: { label: "Referrer", tab: "referrers", displayId: formatReferrerDisplayId, contactKind: null },
};

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export default async function OrgEntityDetailPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  const user = await getCurrentUser();
  // Manager-only, per owner decision — a recruiter who lands here directly is refused.
  if (!isManagerTier(user)) return <Forbidden />;
  if (!(entity in META)) notFound();

  const detail = await getOrgEntityDetail(entity, id);
  if (!detail) notFound();
  const meta = META[detail.kind];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink fallbackHref={`/settings?tab=${meta.tab}`} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            {detail.name}
            <Badge tone={detail.isActive ? "green" : "slate"}>
              {detail.isActive ? "Active" : "Inactive"}
            </Badge>
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-500">
            {meta.displayId(detail)} · {meta.label}
            {detail.location ? ` · ${detail.location}` : ""}
          </p>
        </div>
        <LinkButton href={`/settings?tab=${meta.tab}&edit=${detail.id}`}>Edit</LinkButton>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {detail.kind === "referrer" ? (
            <SummaryItem label="Company">{detail.company || "—"}</SummaryItem>
          ) : (
            <SummaryItem label="Contact person">{detail.contactPerson || "—"}</SummaryItem>
          )}
          <SummaryItem label="Email">{detail.email || "—"}</SummaryItem>
          <SummaryItem label="Phone">{detail.phone || "—"}</SummaryItem>
          {detail.kind !== "referrer" && (
            <SummaryItem label="Location">{detail.location || "—"}</SummaryItem>
          )}
          {detail.recruitedByLabel != null && (
            <SummaryItem label="Recruited by">{detail.recruitedByLabel}</SummaryItem>
          )}
          <SummaryItem label="Notes">{detail.notes || "—"}</SummaryItem>
          <SummaryItem label="Added by">
            {detail.createdBy ? `${detail.createdBy.fullName} · ` : ""}
            {formatDate(detail.createdAt)}
          </SummaryItem>
          <SummaryItem label="Updated by">
            {detail.updatedBy ? `${detail.updatedBy.fullName} · ` : ""}
            {formatDate(detail.updatedAt)}
          </SummaryItem>
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {detail.hasContacts && meta.contactKind && (
          <Card
            title={`Contacts (${detail.contacts.length})`}
            action={
              <EntityContacts
                kind={meta.contactKind}
                parentId={detail.id}
                parentName={detail.name}
                contacts={detail.contacts}
              />
            }
          >
            {detail.contacts.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No contacts yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {detail.contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.isPrimary && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                        Primary
                      </span>
                    )}
                    {c.role && <span className="text-slate-500">{c.role}</span>}
                    <span className="ml-auto text-slate-500">{c.email || c.phone || ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title={`Jobs using this (${detail.jobs.length})`}>
          {detail.jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No jobs reference this yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {detail.jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                  <Link href={`/jobs/${j.id}`} className="font-mono text-xs font-semibold text-indigo-600 hover:underline">
                    {formatJobDisplayId(j)}
                  </Link>
                  <span className="text-slate-700">{j.title}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {JOB_STATUS_LABEL[j.status as keyof typeof JOB_STATUS_LABEL] ?? j.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
