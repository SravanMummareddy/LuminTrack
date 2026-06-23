import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { PlacementsTable } from "@/components/placements/placements-table";
import {
  listPlacements,
  getPlacementsSummary,
  PLACEMENT_SORT_KEYS,
  PLACEMENT_DEFAULT_SORT,
  type PlacementListFilters,
} from "@/server/queries/placements";
import { listClients, listUsers } from "@/server/queries/org";
import { PlacementsFilters } from "@/components/placements/placements-filters";
import { parseSort, parsePage, parseDateRange, parseList, PAGE_SIZE } from "@/lib/filters";
import { PLACEMENT_STATUSES } from "@/lib/labels";
import { requireUser } from "@/lib/session";
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

function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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

  const [{ rows, total, page }, summary, clients, recruiters] = await Promise.all([
    listPlacements(filters),
    getPlacementsSummary(),
    listClients(),
    listUsers(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Rate-derived aggregates are admin-only — the per-row Bill/Pay/Margin are
  // masked for non-admins (except their own placements), so the org-wide weekly
  // margin must be hidden too or it leaks the sum of numbers they can't see.
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Placements"
        description="Candidates currently working an assignment. Created automatically when a submission's status flips to Joined."
      />

      {/* Sticky summary strip — three pinned stats above the table. */}
      <div className="sticky top-0 z-10 -mx-1 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <SummaryStat label="Active placements" value={String(summary.activeCount)} />
        <SummaryStat
          label="Weekly margin (active)"
          value={isAdmin ? formatMoney(summary.weeklyMargin) : "—"}
          hint={isAdmin ? "bill − pay × 40 h" : "Visible to admins"}
        />
        <SummaryStat
          label="Ending in next 14 days"
          value={String(summary.endingSoonCount)}
        />
      </div>

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
          <p className="text-xs text-slate-500">
            {total} placement{total === 1 ? "" : "s"}
          </p>
          <PlacementsTable
            rows={rows}
            pageOffset={(page - 1) * PAGE_SIZE}
            viewer={{ userId: user.id, userRole: user.role }}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
