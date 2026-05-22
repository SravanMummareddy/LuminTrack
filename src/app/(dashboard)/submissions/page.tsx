import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { SubmissionFilters } from "@/components/submissions/submission-filters";
import {
  listSubmissions,
  type SubmissionListFilters,
} from "@/server/queries/submissions";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseDateRange } from "@/lib/filters";
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABEL, SUBMISSION_STATUS_TONE } from "@/lib/labels";
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
  };

  const [submissions, clients, vendors, sources, recruiters] = await Promise.all([
    listSubmissions(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

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

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No submissions match these filters."
              : "No submissions yet. Open a job and submit a candidate to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {submissions.length} submission{submissions.length === 1 ? "" : "s"}
          </p>
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Candidate</Th>
                <Th>Job</Th>
                <Th>Client</Th>
                <Th>Vendor</Th>
                <Th>Submitted by</Th>
                <Th>Status</Th>
                <Th className="text-right">Rounds</Th>
                <Th>Submitted</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/submissions/${s.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {s.candidate.fullName}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/jobs/${s.job.id}`}
                      className="text-slate-700 hover:underline"
                    >
                      {s.job.title}
                    </Link>
                  </Td>
                  <Td>{s.job.client.name}</Td>
                  <Td>{s.job.vendor.name}</Td>
                  <Td>{s.submittedBy.fullName}</Td>
                  <Td>
                    <Badge tone={SUBMISSION_STATUS_TONE[s.status]}>
                      {SUBMISSION_STATUS_LABEL[s.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {s._count.interviewRounds}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(s.submittedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
