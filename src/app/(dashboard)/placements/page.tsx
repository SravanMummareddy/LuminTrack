import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PlacementsTable } from "@/components/placements/placements-table";
import {
  listPlacements,
  PLACEMENT_SORT_KEYS,
  PLACEMENT_DEFAULT_SORT,
  type PlacementListFilters,
} from "@/server/queries/placements";
import { listClients, listUsers } from "@/server/queries/org";
import { PlacementsFilters } from "@/components/placements/placements-filters";
import { parseSort, parsePage, parseDateRange, parseList, PAGE_SIZE } from "@/lib/filters";
import { PLACEMENT_STATUSES } from "@/lib/labels";
import { requireUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import type { PlacementStatus } from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

function asPlacementStatus(value: string | undefined): PlacementStatus | undefined {
  return value && (PLACEMENT_STATUSES as string[]).includes(value)
    ? (value as PlacementStatus)
    : undefined;
}

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const current = {
    q: clean(sp.q),
    // Default to ACTIVE — the most useful view by far. `status=all` explicitly
    // means every status; absence means the ACTIVE default.
    status: sp.status !== undefined ? clean(sp.status) : "ACTIVE",
    clientId: parseList(sp.clientId),
    recruiterId: parseList(sp.recruiterId),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    PLACEMENT_SORT_KEYS,
    PLACEMENT_DEFAULT_SORT,
  );

  const filters: PlacementListFilters = {
    q: current.q,
    status: asPlacementStatus(current.status),
    clientId: current.clientId,
    recruiterId: current.recruiterId,
    startedRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
    sort,
    page: parsePage(clean(sp.page)),
  };

  const [{ rows, total, page }, clients, recruiters] = await Promise.all([
    listPlacements(filters, { id: user.id, role: user.role }),
    listClients(),
    listUsers(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Placements"
        description="Candidates currently working an assignment. Created automatically when a submission's status flips to Joined."
      />

      <PlacementsFilters clients={clients} recruiters={recruiters} />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No placements match these filters. Placements appear automatically
            when a submission moves to Joined.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <PlacementsTable
            rows={rows}
            countLabel={`${total} placement${total === 1 ? "" : "s"}`}
            pageOffset={(page - 1) * PAGE_SIZE}
            viewer={{ userId: user.id, userRole: user.role, isManager: isManagerTier(user) }}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
