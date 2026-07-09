import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button";
import { VendorRequirementsTable } from "@/components/vendor-portal/vendor-requirements-table";
import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
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
import { parseSort, parsePage, parseList, PAGE_SIZE } from "@/lib/filters";
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
    clientId: parseList(sp.clientId),
    vendorId: parseList(sp.vendorId),
    recruiterId: parseList(sp.recruiterId),
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

  // Submit-mode: arrived from a bench/candidate "Submit to a requirement" button.
  // Surface a banner + turn each row's ID cell into a "Submit here →" link that
  // carries the candidate into the convert flow.
  const submitCandidateId = clean(sp.submitCandidateId);
  const submitCandidate = submitCandidateId
    ? await prisma.candidate.findFirst({
        where: { id: submitCandidateId, deletedAt: null },
        select: { fullName: true },
      })
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Vendor Portal Requirements"
          description="Your team's planning records — commercial terms decided up front, then moved to a submission. (Separate from imported iLabor requisitions, which live under Jobs.)"
        />
        {canManage && (
          <Link href="/vendor-portal/new" className={buttonClass("primary")}>
            <Plus className="h-4 w-4" />
            New requirement
          </Link>
        )}
      </div>

      {submitCandidate && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <Send className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Submitting <span className="font-semibold">{submitCandidate.fullName}</span> — pick an
            open requirement below and click <span className="font-medium">Submit here</span> to
            create the submission (prefilled and editable).
          </p>
        </div>
      )}

      <RequirementFilters
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
          <VendorRequirementsTable
            rows={rows}
            countLabel={`${total} requirement${total === 1 ? "" : "s"}`}
            pageOffset={(page - 1) * PAGE_SIZE}
            submitCandidateId={submitCandidate ? submitCandidateId : undefined}
          />
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}

function RequirementFilters({
  clients,
  vendors,
  recruiters,
}: {
  clients: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  recruiters: { id: string; fullName: string }[];
}) {
  const filters: FilterDef[] = [
    {
      kind: "select",
      param: "status",
      label: "Status",
      primary: true,
      defaultValue: "OPEN",
      options: [
        { value: "ALL", label: "All" },
        ...REQUIREMENT_STATUSES.map((s) => ({ value: s, label: REQUIREMENT_STATUS_LABEL[s] })),
      ],
    },
    {
      kind: "select",
      param: "clientId",
      label: "Client",
      primary: true,
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All clients" },
        ...clients.map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    {
      kind: "select",
      param: "vendorId",
      label: "Vendor",
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All vendors" },
        ...vendors.map((v) => ({ value: v.id, label: v.name })),
      ],
    },
    {
      kind: "select",
      param: "recruiterId",
      label: "Recruiter",
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All recruiters" },
        ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
      ],
    },
  ];

  return (
    <FilterBar
      basePath="/vendor-portal"
      search={{ param: "q", placeholder: "Job, candidate, vendor recruiter" }}
      filters={filters}
    />
  );
}
