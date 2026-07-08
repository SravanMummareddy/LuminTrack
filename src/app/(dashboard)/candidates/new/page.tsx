import { PageHeader } from "@/components/ui/page-header";
import { CandidateForm } from "@/components/candidates/candidate-form";
import { createCandidate } from "@/server/actions/candidates";
import { listLookupValues } from "@/server/queries/lookups";

export default async function NewCandidatePage() {
  const [workAuthOptions, workingTypeOptions] = await Promise.all([
    listLookupValues("WORK_AUTH"),
    listLookupValues("WORKING_TYPE"),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add candidate" description="Create a new candidate profile." />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CandidateForm
          action={createCandidate}
          submitLabel="Create candidate"
          workAuthOptions={workAuthOptions}
          workingTypeOptions={workingTypeOptions}
        />
      </div>
    </div>
  );
}
