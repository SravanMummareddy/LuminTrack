import { Plus, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { Pagination } from "@/components/ui/pagination";
import { JobFilters } from "@/components/jobs/job-filters";
import { JobsTable } from "@/components/jobs/jobs-table";
import {
  listJobs,
  JOB_SORT_KEYS,
  JOB_DEFAULT_SORT,
  type JobListFilters,
  type JobSource,
} from "@/server/queries/jobs";
import { JobSourceTabs } from "@/components/jobs/job-source-tabs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseDateRange, parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
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
    clientId: clean(sp.clientId),
    vendorId: clean(sp.vendorId),
    sisterCompanySourceId: clean(sp.sisterCompanySourceId),
    recruiterId: clean(sp.recruiterId),
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
  };

  const [
    { rows: jobs, total, page },
    clients,
    vendors,
    sources,
    recruiters,
    currentUser,
  ] = await Promise.all([
    listJobs(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
    getCurrentUser(),
  ]);

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
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Jobs" description="All job requirements and their pipelines.">
        {currentUser?.role === "ADMIN" ? (
          <LinkButton href="/jobs/import" variant="secondary">
            <Download className="h-4 w-4" />
            Import from iLabor
          </LinkButton>
        ) : null}
        <LinkButton href="/jobs/new">
          <Plus className="h-4 w-4" />
          Add job
        </LinkButton>
      </PageHeader>

      <JobSourceTabs active={activeSource} searchParams={sp} />

      <JobFilters
        current={current}
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
      />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No jobs match these filters."
              : "No jobs yet. Add your first job to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} job{total === 1 ? "" : "s"}
          </p>
          <JobsTable rows={jobs} pageOffset={(page - 1) * PAGE_SIZE} />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
