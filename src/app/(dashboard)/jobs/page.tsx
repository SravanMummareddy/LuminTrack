import Link from "next/link";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess, isManagerTier } from "@/lib/permissions";
import { JOB_TRASH_RETENTION_DAYS } from "@/server/job-erase";
import { Pagination } from "@/components/ui/pagination";
import { JobFilters } from "@/components/jobs/job-filters";
import { JobsTable } from "@/components/jobs/jobs-table";
import { JobTrashList } from "@/components/jobs/job-trash-list";
import {
  listJobs,
  countTrashedJobs,
  JOB_SORT_KEYS,
  JOB_DEFAULT_SORT,
  type JobListFilters,
} from "@/server/queries/jobs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import {
  parseDateRange,
  parseSort,
  parsePage,
  parseList,
  parseEnumList,
  PAGE_SIZE,
} from "@/lib/filters";
import { JOB_STATUSES, DISCIPLINES } from "@/lib/labels";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
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
    sisterCompanySourceId: parseList(sp.sisterCompanySourceId),
    recruiterId: parseList(sp.recruiterId),
    status: parseList(sp.status),
    discipline: parseList(sp.discipline),
    location: clean(sp.location),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

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
    status: parseEnumList(current.status, JOB_STATUSES),
    discipline: parseEnumList(current.discipline, DISCIPLINES),
    location: current.location,
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
    trashCount,
  ] = await Promise.all([
    listJobs(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
    isAdmin ? countTrashedJobs() : Promise.resolve(0),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(
    current.q ||
      current.clientId ||
      current.vendorId ||
      current.sisterCompanySourceId ||
      current.recruiterId ||
      current.status ||
      current.discipline ||
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
          <LinkButton href="/jobs?trash=1" variant="secondary">
            <Trash2 className="h-4 w-4" />
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </LinkButton>
        ) : null}
        {!isTrashView && (
          <LinkButton href="/jobs/new">
            <Plus className="h-4 w-4" />
            Add job
          </LinkButton>
        )}
      </PageHeader>

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
      ) : isTrashView ? (
        <div className="space-y-3">
          <JobTrashList rows={jobs} retentionDays={JOB_TRASH_RETENTION_DAYS} />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      ) : (
        <div className="space-y-3">
          <JobsTable
            rows={jobs}
            isManager={isManagerTier(currentUser)}
            countLabel={`${total} job${total === 1 ? "" : "s"}`}
            pageOffset={(page - 1) * PAGE_SIZE}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
