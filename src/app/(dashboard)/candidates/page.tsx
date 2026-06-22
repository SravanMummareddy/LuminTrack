import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { CandidatesTable } from "@/components/candidates/candidates-table";
import {
  listCandidates,
  CANDIDATE_SORT_KEYS,
  CANDIDATE_DEFAULT_SORT,
  type CandidateListFilters,
} from "@/server/queries/candidates";
import { parseDateRange, parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const current = {
    q: clean(sp.q),
    skill: clean(sp.skill),
    location: clean(sp.location),
    workAuthorization: clean(sp.workAuthorization),
    currentCompany: clean(sp.currentCompany),
    minExperience: clean(sp.minExperience),
    status: clean(sp.status),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const minExp = current.minExperience ? Number(current.minExperience) : undefined;

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    CANDIDATE_SORT_KEYS,
    CANDIDATE_DEFAULT_SORT,
  );

  const filters: CandidateListFilters = {
    q: current.q,
    skill: current.skill,
    location: current.location,
    workAuthorization: current.workAuthorization,
    currentCompany: current.currentCompany,
    minExperience: minExp != null && !Number.isNaN(minExp) ? minExp : undefined,
    isActive:
      current.status === "active"
        ? true
        : current.status === "inactive"
          ? false
          : undefined,
    createdRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
  };

  const { rows: candidates, total, page } = await listCandidates(filters);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(
    current.q ||
      current.skill ||
      current.location ||
      current.workAuthorization ||
      current.currentCompany ||
      current.minExperience ||
      current.status ||
      (current.preset && current.preset !== "all"),
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Candidates" description="All candidate profiles.">
        <LinkButton href="/candidates/new">
          <Plus className="h-4 w-4" />
          Add candidate
        </LinkButton>
      </PageHeader>

      <CandidateFilters />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No candidates match these filters."
              : "No candidates yet. Add your first candidate to get started."}
          </p>
          {!hasFilters && (
            <div className="mt-3 flex justify-center">
              <LinkButton href="/candidates/new">
                <Plus className="h-4 w-4" />
                Add candidate
              </LinkButton>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} candidate{total === 1 ? "" : "s"}
          </p>
          <CandidatesTable
            rows={candidates}
            pageOffset={(page - 1) * PAGE_SIZE}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
