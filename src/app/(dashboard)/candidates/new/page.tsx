import { PageHeader } from "@/components/ui/page-header";
import { CandidateForm } from "@/components/candidates/candidate-form";
import { createCandidate } from "@/server/actions/candidates";
import { listLookupValues } from "@/server/queries/lookups";
import { listReferrers } from "@/server/queries/org";
import { getCurrentUser } from "@/lib/session";
import { canQuickAddOrgEntities } from "@/lib/permissions";

export default async function NewCandidatePage() {
  const [workingTypeOptions, referrers, user] = await Promise.all([
    listLookupValues("WORKING_TYPE"),
    listReferrers(),
    getCurrentUser(),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add candidate" description="Create a new candidate profile." />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CandidateForm
          action={createCandidate}
          submitLabel="Create candidate"
          workingTypeOptions={workingTypeOptions}
          referrers={referrers
            .filter((r) => r.isActive)
            .map((r) => ({ id: r.id, name: r.name }))}
          canAddReferrer={canQuickAddOrgEntities(user ?? undefined)}
        />
      </div>
    </div>
  );
}
