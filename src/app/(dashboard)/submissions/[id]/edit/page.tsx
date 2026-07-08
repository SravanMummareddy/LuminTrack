import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SubmissionEditForm } from "@/components/submissions/submission-edit-form";
import { updateSubmission } from "@/server/actions/submissions";
import { getSubmissionForEdit } from "@/server/queries/submissions";
import { listUsers, listTeamLeadOptions } from "@/server/queries/org";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";

export default async function EditSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [submission, user] = await Promise.all([
    getSubmissionForEdit(id),
    getCurrentUser(),
  ]);
  if (!submission) notFound();

  // Admins may correct the submitting recruiter (scorecards key off it);
  // recruiters see it locked. Only fetch the picker list when it's needed.
  const isAdmin = hasFullAccess(user);
  const recruiters = isAdmin
    ? (await listUsers()).map((u) => ({
        id: u.id,
        fullName: u.fullName,
        isActive: u.isActive,
      }))
    : [];
  const teamLeads = await listTeamLeadOptions();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/submissions/${submission.id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to submission
      </Link>

      <PageHeader
        title="Edit submission"
        description={`${submission.candidate.fullName} → ${submission.job.title}`}
      />

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <SubmissionEditForm
          action={updateSubmission}
          submissionId={submission.id}
          candidateName={submission.candidate.fullName}
          jobTitle={submission.job.title}
          recruiterName={submission.submittedBy.fullName}
          canReattribute={isAdmin}
          recruiters={recruiters}
          teamLeads={teamLeads}
          resumes={submission.candidate.resumes}
          values={{
            resumeSelection: submission.candidateResumeId ?? "",
            submissionNotes: submission.submissionNotes ?? "",
            submittedAt: submission.submittedAt,
            engagement: submission.engagement ?? "",
            vendorRecruiterName: submission.vendorRecruiterName ?? "",
            jobDuties: submission.jobDuties ?? "",
            payRate: submission.payRate?.toString() ?? "",
            billRate: submission.billRate?.toString() ?? "",
            clientRate: submission.clientRate?.toString() ?? "",
            teamLead: submission.teamLead ?? "",
            submittedById: submission.submittedById,
          }}
        />
      </div>
    </div>
  );
}
