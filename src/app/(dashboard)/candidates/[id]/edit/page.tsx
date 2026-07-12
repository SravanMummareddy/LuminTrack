import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  CandidateForm,
  type CandidateFormValues,
} from "@/components/candidates/candidate-form";
import { updateCandidate } from "@/server/actions/candidates";
import { getCandidateForEdit } from "@/server/queries/candidates";
import { listLookupValues } from "@/server/queries/lookups";
import { listReferrers } from "@/server/queries/org";
import { getCurrentUser } from "@/lib/session";
import { canQuickAddOrgEntities } from "@/lib/permissions";

function toDateTimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

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
    firstName: candidate.firstName ?? "",
    lastName: candidate.lastName ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    currentLocation: candidate.currentLocation ?? "",
    workAuthorization: candidate.workAuthorization ?? "",
    totalExperienceYears: candidate.totalExperienceYears?.toString() ?? "",
    realTimeExperienceYears:
      candidate.realTimeExperienceYears?.toString() ?? "",
    technology: candidate.technology ?? "",
    currentCompany: candidate.currentCompany ?? "",
    skills: candidate.skills,
    featuredSkills: candidate.featuredSkills,
    linkedinUrl: candidate.linkedinUrl ?? "",
    notes: candidate.notes ?? "",
    isActive: candidate.isActive,
    status: candidate.status,
    tags: candidate.tags,
    lastContactedAt: candidate.lastContactedAt
      ? toDateTimeLocal(candidate.lastContactedAt)
      : "",
    referrerId: candidate.referrerId ?? "",
    source: candidate.source ?? "",
    isWorking: candidate.isWorking,
    workingType: candidate.workingType ?? "",
    discipline: candidate.discipline ?? "",
  };

  const [workingTypeOptions, referrers, user] = await Promise.all([
    listLookupValues("WORKING_TYPE"),
    listReferrers(),
    getCurrentUser(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Edit candidate" description={candidate.fullName} />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <CandidateForm
          action={updateCandidate}
          values={values}
          submitLabel="Save changes"
          workingTypeOptions={workingTypeOptions}
          referrers={referrers
            .filter((r) => r.isActive || r.id === values.referrerId)
            .map((r) => ({ id: r.id, name: r.name }))}
          canAddReferrer={canQuickAddOrgEntities(user ?? undefined)}
        />
      </div>
    </div>
  );
}
