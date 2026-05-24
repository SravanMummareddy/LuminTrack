import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Pagination } from "@/components/ui/pagination";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import {
  listCandidates,
  CANDIDATE_SORT_KEYS,
  CANDIDATE_DEFAULT_SORT,
  type CandidateListFilters,
} from "@/server/queries/candidates";
import { parseDateRange, parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import {
  formatDate,
  formatExperience,
  formatCandidateDisplayId,
} from "@/lib/format";

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
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Candidates" description="All candidate profiles.">
        <LinkButton href="/candidates/new">
          <Plus className="h-4 w-4" />
          Add candidate
        </LinkButton>
      </PageHeader>

      <CandidateFilters current={current} />

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No candidates match these filters."
              : "No candidates yet. Add your first candidate to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} candidate{total === 1 ? "" : "s"}
          </p>
          <MobileSort
            options={[
              { column: "name", label: "Name" },
              { column: "email", label: "Email" },
              { column: "phone", label: "Phone" },
              { column: "location", label: "Location" },
              { column: "experience", label: "Experience" },
              { column: "subs", label: "Subs", defaultDir: "desc" },
              { column: "updated", label: "Updated", defaultDir: "desc" },
            ]}
          />
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th className="text-right">S.No</Th>
                <Th>ID</Th>
                <SortableHeader column="name" label="Name" />
                <SortableHeader column="email" label="Email" />
                <SortableHeader column="phone" label="Phone" />
                <SortableHeader column="location" label="Location" />
                <SortableHeader column="experience" label="Experience" />
                <Th>Skills</Th>
                <SortableHeader
                  column="subs"
                  label="Subs"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader column="updated" label="Updated" defaultDir="desc" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c, idx) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td label="S.No" secondary className="text-right tabular-nums">
                    {(page - 1) * PAGE_SIZE + idx + 1}
                  </Td>
                  <Td label="ID" secondary className="whitespace-nowrap font-mono text-xs">
                    {formatCandidateDisplayId(c)}
                  </Td>
                  <Td heading>
                    <span className="flex items-center gap-2">
                      <Link
                        href={`/candidates/${c.id}`}
                        className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                      >
                        {c.fullName}
                      </Link>
                      {!c.isActive && <Badge tone="slate">Inactive</Badge>}
                    </span>
                  </Td>
                  <Td label="Email" secondary>
                    {c.email || "—"}
                  </Td>
                  <Td label="Phone" secondary>
                    {c.phone || "—"}
                  </Td>
                  <Td label="Location">{c.currentLocation || "—"}</Td>
                  <Td label="Experience" className="whitespace-nowrap">
                    {formatExperience(c.totalExperienceYears)}
                  </Td>
                  <Td label="Skills" secondary>
                    {c.skills.length === 0 ? (
                      "—"
                    ) : (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {c.skills.map((s) => (
                          <Badge key={s} tone="slate">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td label="Subs" className="text-right tabular-nums">
                    {c._count.submissions}
                  </Td>
                  <Td label="Updated" secondary className="whitespace-nowrap">
                    {formatDate(c.updatedAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} totalPages={totalPages} total={total} />
        </div>
      )}
    </div>
  );
}
