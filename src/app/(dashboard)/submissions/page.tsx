import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
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
import { parseDateRange, parseSort, parsePage, parseList, PAGE_SIZE } from "@/lib/filters";
import { SUBMISSION_STATUSES } from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

function asSubmissionStatusList(
  values: string[] | undefined,
): SubmissionStatus[] {
  return (values ?? []).filter((v) =>
    (SUBMISSION_STATUSES as string[]).includes(v),
  ) as SubmissionStatus[];
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);

  const current = {
    q: clean(sp.q),
    status: parseList(sp.status),
    recruiterId: parseList(sp.recruiterId),
    clientId: parseList(sp.clientId),
    vendorId: parseList(sp.vendorId),
    sisterCompanySourceId: parseList(sp.sisterCompanySourceId),
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
    status: asSubmissionStatusList(current.status),
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
    mineStale,
    currentUserId: user.id,
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
      (current.preset && current.preset !== "all") ||
      mineStale,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Submissions"
        description="Every candidate submitted against a vendor requirement. Submit from a requirement in the Vendor Portal."
      >
        <LinkButton href="/vendor-portal">
          <Plus className="h-4 w-4" />
          New submission
        </LinkButton>
      </PageHeader>

      <SubmissionFilters
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
              : "No submissions yet. Submit a candidate from a vendor requirement."}
          </p>
          {!hasFilters && (
            <div className="mt-3 flex justify-center">
              <LinkButton href="/vendor-portal">
                <Plus className="h-4 w-4" />
                New submission
              </LinkButton>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <SubmissionsTable
            rows={submissions}
            countLabel={`${total} submission${total === 1 ? "" : "s"}`}
            pageOffset={(page - 1) * PAGE_SIZE}
            storageKey="lumintrack.submissions.columns"
            canBulk={hasFullAccess(user)}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
