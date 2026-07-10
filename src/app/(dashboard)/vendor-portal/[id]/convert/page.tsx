import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { convertRequirementToSubmission } from "@/server/actions/requirements";
import { getVendorRequirement } from "@/server/queries/requirements";
import { getJobSubmittedCandidateIds } from "@/server/queries/submissions";
import { listCandidateOptions } from "@/server/queries/candidates";
import { listUsers, listTeamLeadOptions } from "@/server/queries/org";
import { requireUser } from "@/lib/session";
import { canReattributeSubmission } from "@/lib/permissions";
import { formatVendorRequirementDisplayId } from "@/lib/format";

function rateStr(value: number | null): string {
  return value === null ? "" : String(value);
}

export default async function ConvertRequirementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const candidateParam = Array.isArray(sp.candidateId)
    ? sp.candidateId[0]
    : sp.candidateId;
  const user = await requireUser();
  // Only managers / team leads may credit the submission to another recruiter.
  const canReattribute = canReattributeSubmission(user);
  const requirement = await getVendorRequirement(id);
  if (!requirement) notFound();
  if (requirement.status !== "OPEN") redirect(`/vendor-portal/${id}`);

  const [candidates, recruiters, submittedIds, teamLeads] = await Promise.all([
    listCandidateOptions(),
    listUsers(),
    getJobSubmittedCandidateIds(requirement.job.id),
    listTeamLeadOptions(),
  ]);

  // When arriving via a bench/candidate "Submit to a requirement" button, the
  // candidate is passed in the URL — preselect them (if they're a valid option),
  // overriding the requirement's own optional target.
  const prefillCandidateId =
    candidateParam && candidates.some((c) => c.id === candidateParam)
      ? candidateParam
      : (requirement.candidateId ?? "");

  const submitted = new Set(submittedIds);
  const candidateOptions = candidates.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    // The requirement's own candidate stays selectable even if already
    // submitted — the convert flow handles a re-submit via the duplicate gate.
    alreadySubmitted:
      submitted.has(c.id) && c.id !== requirement.candidateId,
    resumes: c.resumes,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/vendor-portal/${id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to requirement
      </Link>

      <PageHeader
        title="Submit a candidate"
        description={`Create a submission against ${formatVendorRequirementDisplayId(requirement)} — prefilled from the requirement and editable. The requirement stays open for more candidates.`}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <SubmissionForm
          action={convertRequirementToSubmission}
          mode="job-locked"
          job={{ id: requirement.job.id, title: requirement.job.title }}
          candidates={candidateOptions}
          recruiters={recruiters}
          teamLeads={teamLeads}
          canReattribute={canReattribute}
          // Admins may retarget, so default to the requirement's recruiter;
          // a recruiter is locked to themselves (matches the server guard).
          defaultRecruiterId={
            canReattribute ? (requirement.recruiterId ?? user.id) : user.id
          }
          requirementId={requirement.id}
          prefill={{
            candidateId: prefillCandidateId,
            engagement: requirement.engagement ?? "",
            vendorRecruiterName: requirement.vendorRecruiterName ?? "",
            jobDuties: requirement.jobDuties ?? "",
            payRate: rateStr(requirement.payRate),
            billRate: rateStr(requirement.billRate),
            clientRate: rateStr(requirement.clientRate),
            teamLead: requirement.teamLead ?? "",
            submissionNotes: requirement.submissionNotes ?? "",
          }}
          cancelHref={`/vendor-portal/${id}`}
        />
      </div>
    </div>
  );
}
