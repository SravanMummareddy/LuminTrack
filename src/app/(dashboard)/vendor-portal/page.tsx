import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { JobsTable } from "@/components/jobs/jobs-table";
import { getCurrentUser } from "@/lib/session";
import {
  listJobs,
  JOB_SORT_KEYS,
  JOB_DEFAULT_SORT,
  type JobListFilters,
} from "@/server/queries/jobs";
import {
  listClients,
  listVendors,
  listActiveRecruiterOptions,
} from "@/server/queries/org";
import { parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import { JOB_STATUSES, JOB_STATUS_LABEL } from "@/lib/labels";
import type { JobStatus } from "@/generated/prisma/enums";
import type { ColumnPrefs } from "@/lib/use-column-prefs";

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

// Requirement-oriented column preset for this view: lead with the iLabor
// requisition fields (Req ID, positions, submit limit, active count, released)
// rather than the internal Job ID / source / recruiters that /jobs leads with.
const VENDOR_PORTAL_COLUMNS: ColumnPrefs = {
  visible: [
    "sno",
    "reqId",
    "title",
    "vendor",
    "client",
    "positions",
    "submitLimit",
    "activeCount",
    "status",
    "released",
  ],
  order: [
    "sno",
    "reqId",
    "title",
    "vendor",
    "client",
    "positions",
    "submitLimit",
    "activeCount",
    "status",
    "released",
    "jobId",
    "source",
    "location",
    "recruiters",
    "subs",
    "created",
    "ilaborStatus",
    "startDate",
    "lastImported",
  ],
};

export default async function VendorPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const current = {
    q: clean(sp.q),
    clientId: clean(sp.clientId),
    vendorId: clean(sp.vendorId),
    status: clean(sp.status),
  };

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    JOB_SORT_KEYS,
    JOB_DEFAULT_SORT,
  );

  // Always scoped to the vendor portal (Randstad iLabor) jobs — these are the
  // open requirements before submission.
  const filters: JobListFilters = {
    q: current.q,
    clientId: current.clientId,
    vendorId: current.vendorId,
    status: asJobStatus(current.status),
    source: "randstad",
    sort,
    page: parsePage(clean(sp.page)),
  };

  const [{ rows, total, page }, clients, vendors, activeRecruiters, currentUser] =
    await Promise.all([
      listJobs(filters),
      listClients(),
      listVendors(),
      listActiveRecruiterOptions(),
      getCurrentUser(),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Vendor Portal"
        description="Open vendor-portal requirements (Randstad iLabor) — the requisitions to submit candidates against."
      />

      <VendorPortalFilters current={current} clients={clients} vendors={vendors} />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No vendor-portal requirements match these filters. Imported iLabor
            requisitions appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} requirement{total === 1 ? "" : "s"}
          </p>
          <JobsTable
            rows={rows}
            pageOffset={(page - 1) * PAGE_SIZE}
            canEditRecruiters={currentUser?.role === "ADMIN"}
            allRecruiters={activeRecruiters}
            storageKey="lumintrack.vendorPortal.columns"
            columnDefaults={VENDOR_PORTAL_COLUMNS}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}

function VendorPortalFilters({
  current,
  clients,
  vendors,
}: {
  current: { q?: string; clientId?: string; vendorId?: string; status?: string };
  clients: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
}) {
  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
        <input
          type="search"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="Job title"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
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
        <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
        <select
          name="status"
          defaultValue={current.status ?? ""}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-4 flex justify-end gap-2">
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
