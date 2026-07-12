import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  BenchConsultantForm,
  type BenchConsultantFormValues,
} from "@/components/bench/bench-consultant-form";
import { updateBenchConsultant } from "@/server/actions/bench-consultants";
import { getBenchConsultantForEdit } from "@/server/queries/bench-consultants";
import { listActiveRecruiterOptions } from "@/server/queries/org";
import { listCandidatesForBench } from "@/server/queries/candidates";
import { listLookupValues } from "@/server/queries/lookups";
import { requireUser } from "@/lib/session";
import { canViewBenchCredentials } from "@/lib/permissions";

function dec(value: { toString(): string } | null): string {
  return value === null ? "" : value.toString();
}
function dateInput(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EditBenchConsultantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [c, recruiters, candidates, callTypeOptions, payrollTypeOptions] =
    await Promise.all([
      getBenchConsultantForEdit(id),
      listActiveRecruiterOptions(),
      listCandidatesForBench(),
      listLookupValues("CALL_TYPE"),
      listLookupValues("PAYROLL_TYPE"),
    ]);
  if (!c) notFound();

  const canCreds = canViewBenchCredentials(user);
  const linkedCandidate = candidates.find((x) => x.id === c.candidateId);

  const values: BenchConsultantFormValues = {
    id: c.id,
    fullName: c.fullName,
    email: c.email ?? "",
    phone: c.phone ?? "",
    currentLocation: c.currentLocation ?? "",
    workAuthorization: c.workAuthorization ?? "",
    mVisa: c.mVisa ?? "",
    aVisa: c.aVisa ?? "",
    marketingExpYears: dec(c.marketingExpYears),
    realTimeExpYears: dec(c.realTimeExpYears),
    technology: c.candidate?.technology ?? "",
    skills: c.skills,
    reference: c.reference ?? "",
    company: c.company ?? "",
    projectType: c.projectType ?? "",
    leastRateC2C: dec(c.leastRateC2C),
    callType: c.callType ?? "",
    payrollType: c.payrollType ?? "",
    relocation: c.relocation,
    relocationCities: c.relocationCities ?? "",
    marketingStartDate: dateInput(c.marketingStartDate),
    // Credentials only round-trip into the form for users allowed to see them.
    marketingEmail: canCreds ? c.marketingEmail ?? "" : "",
    marketingPassword: canCreds ? c.marketingPassword ?? "" : "",
    marketingNumber: canCreds ? c.marketingNumber ?? "" : "",
    personalNumber: canCreds ? c.personalNumber ?? "" : "",
    priority: c.priority,
    marketingStatus: c.marketingStatus,
    notes: c.notes ?? "",
    isActive: c.isActive,
    recruiterId: c.recruiterId ?? "",
    candidateId: c.candidateId ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Edit ${c.fullName}`}
        description="Update this bench consultant's marketing profile."
      />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <BenchConsultantForm
          action={updateBenchConsultant}
          values={values}
          submitLabel="Save changes"
          recruiters={recruiters}
          candidates={candidates}
          linkedCandidate={linkedCandidate}
          canEditCredentials={canCreds}
          callTypeOptions={callTypeOptions}
          payrollTypeOptions={payrollTypeOptions}
        />
      </div>
    </div>
  );
}
