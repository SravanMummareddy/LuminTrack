import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/session";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import { SubmissionsTable } from "@/components/submissions/submissions-table";
import {
  listSubmissions,
  SUBMISSION_SORT_KEYS,
  SUBMISSION_DEFAULT_SORT,
  type SubmissionListFilters,
} from "@/server/queries/submissions";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseDateRange, parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import { SUBMISSION_STATUSES } from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

function asSubmissionStatus(value: string | undefined): SubmissionStatus | undefined {
  return value && (SUBMISSION_STATUSES as string[]).includes(value)
    ? (value as SubmissionStatus)
    : undefined;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  // Option B "Vendor Portal" view: the same submissions list, scoped to
  // Randstad-iLabor-sourced jobs, defaulting to the sheet's columns.
  const vendorPortal = clean(sp.vendorPortal) === "1";

  const current = {
    q: clean(sp.q),
    status: clean(sp.status),
    recruiterId: clean(sp.recruiterId),
    clientId: clean(sp.clientId),
    vendorId: clean(sp.vendorId),
    sisterCompanySourceId: clean(sp.sisterCompanySourceId),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const mineStale = clean(sp.mineStale) === "1";

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    SUBMISSION_SORT_KEYS,
    SUBMISSION_DEFAULT_SORT,
  );

  const filters: SubmissionListFilters = {
    q: current.q,
    status: asSubmissionStatus(current.status),
    recruiterId: current.recruiterId,
    clientId: current.clientId,
    vendorId: current.vendorId,
    sisterCompanySourceId: current.sisterCompanySourceId,
    vendorPortalOnly: vendorPortal,
    submittedRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
    mineStale,
    currentUserId: user.id,
  };

  // The Vendor Portal view leads with the sheet's columns; it also keeps its own
  // column-pref storage key so it doesn't clobber the main Submissions list.
  const VP_COLUMNS = [
    "sno",
    "candidate",
    "job",
    "vendor",
    "client",
    "billRate",
    "payRate",
    "engagement",
    "recruiter",
    "resume",
  ];

  const [
    { rows: submissions, total, page },
    clients,
    vendors,
    sources,
    recruiters,
  ] = await Promise.all([
    listSubmissions(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(
    current.q ||
      current.status ||
      current.recruiterId ||
      current.clientId ||
      current.vendorId ||
      current.sisterCompanySourceId ||
      (current.preset && current.preset !== "all") ||
      mineStale,
  );

  // "Mine, stale >7d" toggle. It's a one-click preset that lives alongside (not
  // inside) the GET filter form, so it preserves the other active params and
  // resets to page 1. Submitting the main filter form clears it — intended.
  const toggleParams = new URLSearchParams();
  for (const [k, v] of Object.entries(current))
    if (v) toggleParams.set(k, v);
  if (!mineStale) toggleParams.set("mineStale", "1");
  const mineStaleHref = `/submissions${
    toggleParams.toString() ? `?${toggleParams.toString()}` : ""
  }`;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={vendorPortal ? "Vendor Portal" : "Submissions"}
        description={
          vendorPortal
            ? "Candidates submitted to Randstad iLabor (Vendor Portal) requirements, with pay/bill rates and résumés."
            : "Every candidate submitted to a job. Create new submissions from a job page."
        }
      >
        <LinkButton href="/submissions/new">
          <Plus className="h-4 w-4" />
          New submission
        </LinkButton>
      </PageHeader>

      <nav className="border-b border-slate-200" aria-label="Submissions view">
        <ul className="-mb-px flex gap-1">
          {[
            { label: "All submissions", href: "/submissions", active: !vendorPortal },
            { label: "Vendor Portal", href: "/submissions?vendorPortal=1", active: vendorPortal },
          ].map((t) => (
            <li key={t.href}>
              <a
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={
                  "inline-block border-b-2 px-3 py-2 text-sm font-medium transition " +
                  (t.active
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700")
                }
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <SubmissionFilters
        current={current}
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={mineStaleHref}
          aria-pressed={mineStale}
          className={
            mineStale
              ? "inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
              : "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          }
        >
          Mine, stale &gt;7d
          {mineStale && <span aria-hidden>✕</span>}
        </Link>
        {mineStale && (
          <span className="text-xs text-slate-400">
            Your early-pipeline submissions sitting in a stage over 7 days.
          </span>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No submissions match these filters."
              : "No submissions yet. Create the first one to get started."}
          </p>
          {!hasFilters && (
            <div className="mt-3 flex justify-center">
              <LinkButton href="/submissions/new">
                <Plus className="h-4 w-4" />
                New submission
              </LinkButton>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} submission{total === 1 ? "" : "s"}
          </p>
          <SubmissionsTable
            rows={submissions}
            pageOffset={(page - 1) * PAGE_SIZE}
            storageKey={
              vendorPortal
                ? "lumintrack.vendorportal.columns"
                : "lumintrack.submissions.columns"
            }
            defaultVisibleKeys={vendorPortal ? VP_COLUMNS : undefined}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
