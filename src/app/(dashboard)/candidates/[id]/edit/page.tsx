import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  CandidateForm,
  type CandidateFormValues,
} from "@/components/candidates/candidate-form";
import { updateCandidate } from "@/server/actions/candidates";
import { getCandidateForEdit } from "@/server/queries/candidates";

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const candidate = await getCandidateForEdit(id);
  if (!candidate) notFound();

  const values: CandidateFormValues = {
    id: candidate.id,
    fullName: candidate.fullName,
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    currentLocation: candidate.currentLocation ?? "",
    workAuthorization: candidate.workAuthorization ?? "",
    totalExperienceYears: candidate.totalExperienceYears?.toString() ?? "",
    currentCompany: candidate.currentCompany ?? "",
    skills: candidate.skills,
    linkedinUrl: candidate.linkedinUrl ?? "",
    notes: candidate.notes ?? "",
    isActive: candidate.isActive,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit candidate" description={candidate.fullName} />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CandidateForm
          action={updateCandidate}
          values={values}
          submitLabel="Save changes"
        />
      </div>
    </div>
  );
}
