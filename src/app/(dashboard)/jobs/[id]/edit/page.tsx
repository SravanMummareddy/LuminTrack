import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { JobForm, type JobFormValues } from "@/components/jobs/job-form";
import { updateJob } from "@/server/actions/jobs";
import { getJobForEdit } from "@/server/queries/jobs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, clients, vendors, sources, recruiters] = await Promise.all([
    getJobForEdit(id),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);
  if (!job) notFound();

  const toDateInput = (d: Date | null | undefined) =>
    d ? d.toISOString().slice(0, 10) : "";

  const values: JobFormValues = {
    id: job.id,
    title: job.title,
    clientId: job.clientId,
    vendorId: job.vendorId,
    sisterCompanySourceId: job.sisterCompanySourceId ?? "",
    sourceOther: job.sourceOther ?? "",
    status: job.status,
    location: job.location ?? "",
    clientRate: job.clientRate?.toString() ?? "",
    vendorRate: job.vendorRate?.toString() ?? "",
    candidateRate: job.candidateRate?.toString() ?? "",
    description: job.description ?? "",
    notes: job.notes ?? "",
    recruiterIds: job.assignments.map((a) => a.recruiterId),
    positions: job.positions?.toString() ?? "",
    reqType: job.reqType ?? "",
    department: job.department ?? "",
    durationLabel: job.durationLabel ?? "",
    atsId: job.atsId ?? "",
    startDate: toDateInput(job.startDate),
    endDate: toDateInput(job.endDate),
    workMode: job.workMode ?? "",
    priority: job.priority ?? "",
    targetCloseDate: toDateInput(job.targetCloseDate),
    postingUrl: job.postingUrl ?? "",
    workAuthRequirement: job.workAuthRequirement ?? "",
    skills: job.skills.join(", "),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit job" description={job.title} />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <JobForm
          action={updateJob}
          clients={clients}
          vendors={vendors}
          sources={sources}
          recruiters={recruiters}
          values={values}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
