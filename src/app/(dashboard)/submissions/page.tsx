import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Td, cardLink } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { MobileSort } from "@/components/ui/mobile-sort";
import { Pagination } from "@/components/ui/pagination";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
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
import { parseDateRange, parseSort, parsePage, PAGE_SIZE } from "@/lib/filters";
import {
  SUBMISSION_STATUSES,
  SUBMISSION_STATUS_LABEL,
  SUBMISSION_STATUS_TONE,
} from "@/lib/labels";
import { formatDate } from "@/lib/format";
import type { SubmissionStatus } from "@/generated/prisma/enums";

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

function asSubmissionStatus(value: string | undefined): SubmissionStatus | undefined {
  return value && (SUBMISSION_STATUSES as string[]).includes(value)
    ? (value as SubmissionStatus)
    : undefined;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const current = {
    q: clean(sp.q),
    status: clean(sp.status),
    recruiterId: clean(sp.recruiterId),
    clientId: clean(sp.clientId),
    vendorId: clean(sp.vendorId),
    sisterCompanySourceId: clean(sp.sisterCompanySourceId),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const sort = parseSort(
    clean(sp.sort),
    clean(sp.dir),
    SUBMISSION_SORT_KEYS,
    SUBMISSION_DEFAULT_SORT,
  );

  const filters: SubmissionListFilters = {
    q: current.q,
    status: asSubmissionStatus(current.status),
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
      (current.preset && current.preset !== "all"),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Submissions"
        description="Every candidate submitted to a job. Create new submissions from a job page."
      />

      <SubmissionFilters
        current={current}
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
              : "No submissions yet. Open a job and submit a candidate to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {total} submission{total === 1 ? "" : "s"}
          </p>
          <MobileSort
            options={[
              { column: "candidate", label: "Candidate" },
              { column: "job", label: "Job" },
              { column: "client", label: "Client" },
              { column: "vendor", label: "Vendor" },
              { column: "recruiter", label: "Submitted by" },
              { column: "status", label: "Status" },
              { column: "rounds", label: "Rounds", defaultDir: "desc" },
              { column: "submitted", label: "Submitted", defaultDir: "desc" },
            ]}
          />
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <SortableHeader column="candidate" label="Candidate" />
                <SortableHeader column="job" label="Job" />
                <SortableHeader column="client" label="Client" />
                <SortableHeader column="vendor" label="Vendor" />
                <SortableHeader column="recruiter" label="Submitted by" />
                <SortableHeader column="status" label="Status" />
                <SortableHeader
                  column="rounds"
                  label="Rounds"
                  align="right"
                  defaultDir="desc"
                />
                <SortableHeader
                  column="submitted"
                  label="Submitted"
                  defaultDir="desc"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td heading>
                    <Link
                      href={`/submissions/${s.id}`}
                      className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                    >
                      {s.candidate.fullName}
                    </Link>
                  </Td>
                  <Td label="Job">
                    <Link
                      href={`/jobs/${s.job.id}`}
                      className="text-slate-700 hover:underline"
                    >
                      {s.job.title}
                    </Link>
                  </Td>
                  <Td label="Client" secondary>
                    {s.job.client.name}
                  </Td>
                  <Td label="Vendor" secondary>
                    {s.job.vendor.name}
                  </Td>
                  <Td label="Submitted by" secondary>
                    {s.submittedBy.fullName}
                  </Td>
                  <Td label="Status">
                    <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Badge>
                  </Td>
                  <Td label="Rounds" className="text-right tabular-nums">
                    {s._count.interviewRounds}
                  </Td>
                  <Td label="Submitted" secondary className="whitespace-nowrap">
                    {formatDate(s.submittedAt)}
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
