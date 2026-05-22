import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { CandidateFilters } from "@/components/candidates/candidate-filters";
import {
  listCandidates,
  type CandidateListFilters,
} from "@/server/queries/candidates";
import { parseDateRange } from "@/lib/filters";
import { formatDate, formatExperience } from "@/lib/format";

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
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const minExp = current.minExperience ? Number(current.minExperience) : undefined;

  const filters: CandidateListFilters = {
    q: current.q,
    skill: current.skill,
    location: current.location,
    workAuthorization: current.workAuthorization,
    currentCompany: current.currentCompany,
    minExperience: minExp != null && !Number.isNaN(minExp) ? minExp : undefined,
    createdRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
  };

  const candidates = await listCandidates(filters);

  const hasFilters = Boolean(
    current.q ||
      current.skill ||
      current.location ||
      current.workAuthorization ||
      current.currentCompany ||
      current.minExperience ||
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

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No candidates match these filters."
              : "No candidates yet. Add your first candidate to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
          </p>
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Location</Th>
                <Th>Experience</Th>
                <Th>Skills</Th>
                <Th className="text-right">Subs</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/candidates/${c.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {c.fullName}
                    </Link>
                  </Td>
                  <Td>{c.email || "—"}</Td>
                  <Td>{c.phone || "—"}</Td>
                  <Td>{c.currentLocation || "—"}</Td>
                  <Td className="whitespace-nowrap">
                    {formatExperience(c.totalExperienceYears)}
                  </Td>
                  <Td>
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
                  <Td className="text-right tabular-nums">
                    {c._count.submissions}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(c.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
