import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Th, Td } from "@/components/ui/table";
import { JobFilters } from "@/components/jobs/job-filters";
import { listJobs, type JobListFilters } from "@/server/queries/jobs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";
import { parseDateRange } from "@/lib/filters";
import { JOB_STATUSES, JOB_STATUS_LABEL, JOB_STATUS_TONE } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import type { JobStatus } from "@/generated/prisma/enums";

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

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const current = {
    q: clean(sp.q),
    clientId: clean(sp.clientId),
    vendorId: clean(sp.vendorId),
    sisterCompanySourceId: clean(sp.sisterCompanySourceId),
    recruiterId: clean(sp.recruiterId),
    status: clean(sp.status),
    location: clean(sp.location),
    preset: clean(sp.preset),
    from: clean(sp.from),
    to: clean(sp.to),
  };

  const filters: JobListFilters = {
    q: current.q,
    clientId: current.clientId,
    vendorId: current.vendorId,
    sisterCompanySourceId: current.sisterCompanySourceId,
    recruiterId: current.recruiterId,
    status: asJobStatus(current.status),
    location: current.location,
    createdRange: parseDateRange({
      preset: current.preset,
      from: current.from,
      to: current.to,
    }),
  };

  const [jobs, clients, vendors, sources, recruiters] = await Promise.all([
    listJobs(filters),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

  const hasFilters = Boolean(
    current.q ||
      current.clientId ||
      current.vendorId ||
      current.sisterCompanySourceId ||
      current.recruiterId ||
      current.status ||
      current.location ||
      (current.preset && current.preset !== "all"),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Jobs" description="All job requirements and their pipelines.">
        <LinkButton href="/jobs/new">
          <Plus className="h-4 w-4" />
          Add job
        </LinkButton>
      </PageHeader>

      <JobFilters
        current={current}
        clients={clients}
        vendors={vendors}
        sources={sources}
        recruiters={recruiters}
      />

      {jobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {hasFilters
              ? "No jobs match these filters."
              : "No jobs yet. Add your first job to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {jobs.length} job{jobs.length === 1 ? "" : "s"}
          </p>
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Job title</Th>
                <Th>Client</Th>
                <Th>Vendor</Th>
                <Th>Source</Th>
                <Th>Location</Th>
                <Th>Recruiters</Th>
                <Th>Status</Th>
                <Th className="text-right">Subs</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {job.title}
                    </Link>
                  </Td>
                  <Td>{job.client.name}</Td>
                  <Td>{job.vendor.name}</Td>
                  <Td>{job.sisterCompanySource.name}</Td>
                  <Td>{job.location || "—"}</Td>
                  <Td>
                    {job.assignments.length
                      ? job.assignments.map((a) => a.recruiter.fullName).join(", ")
                      : "—"}
                  </Td>
                  <Td>
                    <Badge tone={JOB_STATUS_TONE[job.status]}>
                      {JOB_STATUS_LABEL[job.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{job._count.submissions}</Td>
                  <Td className="whitespace-nowrap">{formatDate(job.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
