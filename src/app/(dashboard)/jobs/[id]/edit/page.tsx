import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { JobForm, type JobFormValues } from "@/components/jobs/job-form";
import { updateJob } from "@/server/actions/jobs";
import { getJobForEdit } from "@/server/queries/jobs";
import { getCurrentUser } from "@/lib/session";
import { canEditJobRatesAndAssignment } from "@/lib/permissions";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listReferrers,
} from "@/server/queries/org";
import { JOB_BOARD_SEED } from "@/lib/labels";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, clients, vendors, sources, referrers, user] = await Promise.all([
    getJobForEdit(id),
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listReferrers(),
    getCurrentUser(),
  ]);
  if (!job) notFound();
  const canRates = canEditJobRatesAndAssignment(user);

  const toDateInput = (d: Date | null | undefined) =>
    d ? d.toISOString().slice(0, 10) : "";

  const values: JobFormValues = {
    id: job.id,
    title: job.title,
    clientId: job.clientId,
    vendorId: job.vendorId,
    sourceType: job.sourceType,
    jobBoard: job.jobBoard ?? "",
    referrerId: job.referrerId ?? "",
    sisterCompanySourceId: job.sisterCompanySourceId ?? "",
    sourceOther: job.sourceOther ?? "",
    status: job.status,
    location: job.location ?? "",
    clientRate: job.clientRate?.toString() ?? "",
    vendorRate: job.vendorRate?.toString() ?? "",
    description: job.description ?? "",
    notes: job.notes ?? "",
    positions: job.positions?.toString() ?? "",
    receivedAt: toDateInput(job.receivedAt),
    startDate: toDateInput(job.startDate),
    startDateEstimated: job.startDateEstimated,
    endDate: toDateInput(job.endDate),
    workMode: job.workMode ?? "",
    priority: job.priority ?? "",
    discipline: job.discipline ?? "",
    targetCloseDate: toDateInput(job.targetCloseDate),
    postingUrl: job.postingUrl ?? "",
    workAuthRequirement: job.workAuthRequirement ?? "",
    skills: job.skills.join(", "),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit job" description={job.title} />
      <JobForm
        action={updateJob}
        clients={clients}
        vendors={vendors}
        sources={sources}
        referrers={referrers}
        jobBoards={[...JOB_BOARD_SEED]}
        values={values}
        todayIso={new Date().toISOString().slice(0, 10)}
        submitLabel="Save changes"
        canManageRatesAndAssignment={canRates}
      />
    </div>
  );
}
