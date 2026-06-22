import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button";
import { VendorRequirementsTable } from "@/components/vendor-portal/vendor-requirements-table";
import { getCurrentUser } from "@/lib/session";
import { canManageRequirements } from "@/lib/permissions";
import {
  listVendorRequirements,
  REQUIREMENT_SORT_KEYS,
  REQUIREMENT_DEFAULT_SORT,
  type VendorRequirementFilters,
} from "@/server/queries/requirements";
import {
  listClients,
  listVendors,
  listActiveRecruiterOptions,
} from "@/server/queries/org";
import { parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import { REQUIREMENT_STATUSES, REQUIREMENT_STATUS_LABEL } from "@/lib/labels";
import type { RequirementStatus } from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

// Status is OPEN by default (the planning queue). "ALL" clears the filter.
function asRequirementStatus(
  value: string | undefined,
): RequirementStatus | undefined {
  if (value === "ALL") return undefined;
  if (value === undefined) return "OPEN";
  return (REQUIREMENT_STATUSES as string[]).includes(value)
    ? (value as RequirementStatus)
    : "OPEN";
}

export default async function VendorPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const current = {
    q: clean(sp.q),
    status: clean(sp.status) ?? "OPEN",
    clientId: clean(sp.clientId),
    vendorId: clean(sp.vendorId),
    recruiterId: clean(sp.recruiterId),
  };

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    REQUIREMENT_SORT_KEYS,
    REQUIREMENT_DEFAULT_SORT,
  );

  const filters: VendorRequirementFilters = {
    q: current.q,
    status: asRequirementStatus(current.status),
    clientId: current.clientId,
    vendorId: current.vendorId,
    recruiterId: current.recruiterId,
    sort,
    page: parsePage(clean(sp.page)),
  };

  const [{ rows, total, page }, clients, vendors, recruiters, user] =
    await Promise.all([
      listVendorRequirements(filters),
      listClients(),
      listVendors(),
      listActiveRecruiterOptions(),
      getCurrentUser(),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canManage = canManageRequirements(user ?? undefined);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Vendor Portal Requirements"
          description="Planned vendor requirements — commercial terms decided up front, then moved to a submission."
        />
        {canManage && (
          <Link href="/vendor-portal/new" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" />
            New requirement
          </Link>
        )}
      </div>

      <RequirementFilters
        current={current}
        clients={clients}
        vendors={vendors}
        recruiters={recruiters}
      />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No vendor requirements match these filters.
            {canManage ? (
              <>
                {" "}
                <Link
                  href="/vendor-portal/new"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Create one
                </Link>{" "}
                to start planning.
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} requirement{total === 1 ? "" : "s"}
          </p>
          <VendorRequirementsTable
            rows={rows}
            pageOffset={(page - 1) * PAGE_SIZE}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}

function RequirementFilters({
  current,
  clients,
  vendors,
  recruiters,
}: {
  current: {
    q?: string;
    status: string;
    clientId?: string;
    vendorId?: string;
    recruiterId?: string;
  };
  clients: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  recruiters: { id: string; fullName: string }[];
}) {
  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="Job, candidate, vendor recruiter"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
        <select
          name="status"
          defaultValue={current.status}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="ALL">All</option>
          {REQUIREMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REQUIREMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Client</span>
        <select
          name="clientId"
          defaultValue={current.clientId ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Vendor</span>
        <select
          name="vendorId"
          defaultValue={current.vendorId ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Recruiter</span>
        <select
          name="recruiterId"
          defaultValue={current.recruiterId ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {recruiters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-5 flex justify-end gap-2">
        <Link
          href="/vendor-portal"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Reset
        </Link>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
