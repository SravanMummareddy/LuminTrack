import Link from "next/link";
import { Plus, Download, History, Trash2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { JOB_TRASH_RETENTION_DAYS } from "@/server/job-erase";
import { Pagination } from "@/components/ui/pagination";
import { JobFilters } from "@/components/jobs/job-filters";
import { JobsTable } from "@/components/jobs/jobs-table";
import {
  listJobs,
  getLastIlaborImport,
  JOB_SORT_KEYS,
  JOB_DEFAULT_SORT,
  type JobListFilters,
  type JobSource,
} from "@/server/queries/jobs";
import { formatDateTime } from "@/lib/format";
import { JobSourceTabs } from "@/components/jobs/job-source-tabs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseDateRange, parseSort, parsePage, parseList, PAGE_SIZE } from "@/lib/filters";
import { JOB_STATUSES } from "@/lib/labels";
import type { JobStatus } from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

function asJobStatus(value: string | undefined): JobStatus | undefined {
  return value && (JOB_STATUSES as string[]).includes(value)
    ? (value as JobStatus)
    : undefined;
}

function asJobSource(value: string | undefined): JobSource | undefined {
  return value === "manual" || value === "randstad" ? value : undefined;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const current = {
    q: clean(sp.q),
    clientId: parseList(sp.clientId),
    vendorId: parseList(sp.vendorId),
    sisterCompanySourceId: clean(sp.sisterCompanySourceId),
    recruiterId: parseList(sp.recruiterId),
    status: clean(sp.status),
    location: clean(sp.location),
    source: clean(sp.source),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };
  const activeSource = asJobSource(current.source);

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    JOB_SORT_KEYS,
    JOB_DEFAULT_SORT,
  );

  const currentUser = await getCurrentUser();
  const isAdmin = hasFullAccess(currentUser);
  const isTrashView = isAdmin && clean(sp.trash) === "1";

  const filters: JobListFilters = {
    q: current.q,
    clientId: current.clientId,
    vendorId: current.vendorId,
    sisterCompanySourceId: current.sisterCompanySourceId,
    recruiterId: current.recruiterId,
    status: asJobStatus(current.status),
    location: current.location,
    source: activeSource,
    createdRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
    trash: isTrashView,
  };

  const [
    { rows: jobs, total, page },
    clients,
    vendors,
    sources,
    recruiters,
    lastImport,
  ] = await Promise.all([
    listJobs(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
    // Only fetched (used) on the Randstad tab as admin, but cheap enough to
    // always run in parallel — it's a single indexed findFirst.
    getLastIlaborImport(),
  ]);

  const showLastImportBanner =
    activeSource === "randstad" &&
    hasFullAccess(currentUser) &&
    lastImport !== null;

  let bannerCounts: { createdCount: number; updatedCount: number } | null = null;
  if (showLastImportBanner && lastImport.newValue) {
    try {
      const parsed = JSON.parse(lastImport.newValue) as {
        createdCount?: number;
        updatedCount?: number;
      };
      bannerCounts = {
        createdCount: parsed.createdCount ?? 0,
        updatedCount: parsed.updatedCount ?? 0,
      };
    } catch {
      // Older audit rows may have a non-JSON newValue — banner still renders
      // with timestamps only.
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(
    current.q ||
      current.clientId ||
      current.vendorId ||
      current.sisterCompanySourceId ||
      current.recruiterId ||
      current.status ||
      current.location ||
      (current.preset && current.preset !== "all"),
  );

  return (
    <div className="space-y-5">
      {isTrashView && (
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>
      )}
      <PageHeader
        title={isTrashView ? "Trash" : "Jobs"}
        description={
          isTrashView
            ? `Trashed jobs, restorable for ${JOB_TRASH_RETENTION_DAYS} days before they're permanently erased.`
            : "All job requirements and their pipelines."
        }
      >
        {!isTrashView && isAdmin ? (
          <>
            <LinkButton href="/jobs/imports" variant="secondary">
              <History className="h-4 w-4" />
              Import history
            </LinkButton>
            <LinkButton href="/jobs/import" variant="secondary">
              <Download className="h-4 w-4" />
              Import from iLabor
            </LinkButton>
            <LinkButton href="/jobs?trash=1" variant="secondary">
              <Trash2 className="h-4 w-4" />
              Trash
            </LinkButton>
          </>
        ) : null}
        {!isTrashView && (
          <LinkButton href="/jobs/new">
            <Plus className="h-4 w-4" />
            Add job
          </LinkButton>
        )}
      </PageHeader>

      {!isTrashView && (
        <JobSourceTabs active={activeSource} searchParams={sp} />
      )}

      {!isTrashView && showLastImportBanner && lastImport ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Last imported{" "}
          {bannerCounts ? (
            <>
              <strong className="text-slate-800">
                {bannerCounts.createdCount}
              </strong>{" "}
              new ·{" "}
              <strong className="text-slate-800">
                {bannerCounts.updatedCount}
              </strong>{" "}
              updated ·{" "}
            </>
          ) : null}
          {formatDateTime(lastImport.createdAt)}
          {lastImport.performedBy
            ? ` · by ${lastImport.performedBy.fullName}`
            : ""}
          {" · "}
          <Link
            href="/jobs/imports"
            className="text-indigo-600 hover:underline"
          >
            View all
          </Link>
        </div>
      ) : null}

      {!isTrashView && (
        <JobFilters
          clients={clients}
          vendors={vendors}
          sources={sources}
          recruiters={recruiters}
        />
      )}

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {isTrashView
              ? "Trash is empty."
              : hasFilters
                ? "No jobs match these filters."
                : "No jobs yet. Add your first job to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <JobsTable
            rows={jobs}
            countLabel={`${total} job${total === 1 ? "" : "s"}`}
            pageOffset={(page - 1) * PAGE_SIZE}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
