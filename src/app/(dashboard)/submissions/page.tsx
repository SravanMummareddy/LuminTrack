import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
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
  const sp = await searchParams;

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
    submittedRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
  };

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
      (current.preset && current.preset !== "all"),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Submissions"
        description="Every candidate submitted to a job. Create new submissions from a job page."
      />

      <SubmissionFilters
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
              ? "No submissions match these filters."
              : "No submissions yet. Open a job and submit a candidate to get started."}
          </p>
          {!hasFilters && (
            <div className="mt-3 flex justify-center">
              <LinkButton href="/jobs">Browse jobs</LinkButton>
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
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
