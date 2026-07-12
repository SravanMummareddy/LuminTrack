import { PageHeader } from "@/components/ui/page-header";
import { JobForm } from "@/components/jobs/job-form";
import { createJob } from "@/server/actions/jobs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listReferrers,
} from "@/server/queries/org";
import { getCurrentUser } from "@/lib/session";
import { canQuickAddOrgEntities, hasFullAccess } from "@/lib/permissions";
import { JOB_BOARD_SEED } from "@/lib/labels";

export default async function NewJobPage() {
  const [clients, vendors, sources, referrers, user] = await Promise.all([
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listReferrers(),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add job" description="Create a new job requirement." />
      <JobForm
        action={createJob}
        clients={clients}
        vendors={vendors}
        sources={sources}
        referrers={referrers}
        jobBoards={[...JOB_BOARD_SEED]}
        todayIso={new Date().toISOString().slice(0, 10)}
        submitLabel="Create job"
        canQuickAdd={canQuickAddOrgEntities(user)}
        canManageRatesAndAssignment={hasFullAccess(user)}
      />
    </div>
  );
}
