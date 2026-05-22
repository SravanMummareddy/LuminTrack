import { PageHeader } from "@/components/ui/page-header";
import { CandidateForm } from "@/components/candidates/candidate-form";
import { createCandidate } from "@/server/actions/candidates";

export default function NewCandidatePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add candidate" description="Create a new candidate profile." />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CandidateForm action={createCandidate} submitLabel="Create candidate" />
      </div>
    </div>
  );
}
