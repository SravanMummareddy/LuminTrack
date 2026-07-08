import Link from "next/link";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import { CandidatesTable } from "@/components/candidates/candidates-table";
import { CandidateTrashList } from "@/components/candidates/candidate-trash-list";
import {
  listCandidates,
  countTrashedCandidates,
  CANDIDATE_SORT_KEYS,
  CANDIDATE_DEFAULT_SORT,
  type CandidateListFilters,
} from "@/server/queries/candidates";
import { CANDIDATE_TRASH_RETENTION_DAYS } from "@/server/candidate-erase";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import {
  parseDateRange,
  parseSort,
  parsePage,
  parseList,
  PAGE_SIZE,
} from "@/lib/filters";
import type { Discipline } from "@/generated/prisma/enums";

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
  const user = await getCurrentUser();
  const isAdmin = hasFullAccess(user);
  const isTrashView = clean(sp.trash) === "1" && isAdmin;

  const current = {
    q: clean(sp.q),
    skill: clean(sp.skill),
    location: clean(sp.location),
    workAuthorization: clean(sp.workAuthorization),
    currentCompany: clean(sp.currentCompany),
    minExperience: clean(sp.minExperience),
    status: clean(sp.status),
    discipline: parseList(sp.discipline),
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
    discipline: (current.discipline ?? []).filter(
      (d): d is Discipline => d === "IT" || d === "NON_IT",
    ),
    createdRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
    trash: isTrashView,
  };

  const [{ rows: candidates, total, page }, trashCount] = await Promise.all([
    listCandidates(filters),
    isAdmin ? countTrashedCandidates() : Promise.resolve(0),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isTrashView) {
    return (
      <div className="space-y-5">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to candidates
        </Link>
        <PageHeader
          title="Trash"
          description={`Trashed candidates, restorable for ${CANDIDATE_TRASH_RETENTION_DAYS} days before they're permanently erased.`}
        />
        {total === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">Trash is empty.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              {total} candidate{total === 1 ? "" : "s"} in trash
            </p>
            <CandidateTrashList
              rows={candidates}
              retentionDays={CANDIDATE_TRASH_RETENTION_DAYS}
            />
            <Pagination page={page} totalPages={totalPages} total={total} />
          </div>
        )}
      </div>
    );
  }

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
      <PageHeader title="Candidates" description="Every candidate profile — the full talent pool. (Bench = those actively marketed; Placements = those already working.)">
        {isAdmin && (
          <LinkButton href="/candidates?trash=1" variant="secondary">
            <Trash2 className="h-4 w-4" />
            Trash{trashCount > 0 ? ` (${trashCount})` : ""}
          </LinkButton>
        )}
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
          <CandidatesTable
            rows={candidates}
            countLabel={`${total} candidate${total === 1 ? "" : "s"}`}
            pageOffset={(page - 1) * PAGE_SIZE}
            canDelete={isAdmin}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
