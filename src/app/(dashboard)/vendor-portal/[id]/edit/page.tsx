import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RequirementForm } from "@/components/vendor-portal/requirement-form";
import { updateVendorRequirement } from "@/server/actions/requirements";
import { getVendorRequirement } from "@/server/queries/requirements";
import { listCandidateOptions } from "@/server/queries/candidates";
import { listUsers } from "@/server/queries/org";
import { getCurrentUser } from "@/lib/session";
import { canManageRequirements } from "@/lib/permissions";
import { formatJobDisplayId } from "@/lib/format";

function rateStr(value: number | null): string {
  return value === null ? "" : String(value);
}

export default async function EditRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageRequirements(user ?? undefined)) redirect(`/vendor-portal/${id}`);

  const requirement = await getVendorRequirement(id);
  if (!requirement) notFound();
  // Converted / cancelled requirements are read-only.
  if (requirement.status !== "OPEN") redirect(`/vendor-portal/${id}`);

  const [candidates, recruiters] = await Promise.all([
    listCandidateOptions(),
    listUsers(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/vendor-portal/${id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to requirement
      </Link>
      <PageHeader title="Edit requirement" />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <RequirementForm
          action={updateVendorRequirement}
          mode="edit"
          requirementId={requirement.id}
          job={{
            id: requirement.job.id,
            title: requirement.job.title,
            displayId: formatJobDisplayId(requirement.job),
            clientName: requirement.job.client?.name ?? null,
            location: requirement.job.location,
          }}
          candidates={candidates.map((c) => ({ id: c.id, fullName: c.fullName }))}
          recruiters={recruiters.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            isActive: r.isActive,
          }))}
          defaults={{
            candidateId: requirement.candidateId ?? "",
            recruiterId: requirement.recruiterId ?? "",
            location: requirement.location ?? "",
            payRate: rateStr(requirement.payRate),
            billRate: rateStr(requirement.billRate),
            candidateRate: rateStr(requirement.candidateRate),
            clientRate: rateStr(requirement.clientRate),
            engagement: requirement.engagement ?? "",
            vendorRecruiterName: requirement.vendorRecruiterName ?? "",
            jobDuties: requirement.jobDuties ?? "",
            teamLead: requirement.teamLead ?? "",
            submissionNotes: requirement.submissionNotes ?? "",
            resumeDriveLink: requirement.resumeDriveLink ?? "",
          }}
          cancelHref={`/vendor-portal/${id}`}
        />
      </div>
    </div>
  );
}
