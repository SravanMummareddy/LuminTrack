import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { createSubmission } from "@/server/actions/submissions";
import { getJobSummary } from "@/server/queries/jobs";
import { getJobSubmittedCandidateIds } from "@/server/queries/submissions";
import { listCandidateOptions } from "@/server/queries/candidates";
import { getOpenRequirementPrefill } from "@/server/queries/requirements";
import { listUsers } from "@/server/queries/org";
import { formatVendorRequirementDisplayId } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function NewSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, candidates, recruiters, submittedIds, user, reqPrefill] =
    await Promise.all([
      getJobSummary(id),
      listCandidateOptions(),
      listUsers(),
      getJobSubmittedCandidateIds(id),
      requireUser(),
      getOpenRequirementPrefill(id),
    ]);
  if (!job) notFound();

  const submitted = new Set(submittedIds);
  const candidateOptions = candidates.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    alreadySubmitted: submitted.has(c.id),
    resumes: c.resumes,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/jobs/${job.id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to job
      </Link>

      <PageHeader
        title="Submit a candidate"
        description={
          reqPrefill
            ? `Add a candidate submission to "${job.title}". Commercial terms prefilled from ${formatVendorRequirementDisplayId(reqPrefill)} — edit as needed.`
            : `Add a candidate submission to "${job.title}".`
        }
      />

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No candidates yet.{" "}
            <Link
              href="/candidates/new"
              className="font-medium text-indigo-600 hover:underline"
            >
              Add a candidate
            </Link>{" "}
            before creating a submission.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <SubmissionForm
            action={createSubmission}
            mode="job-locked"
            job={{ id: job.id, title: job.title }}
            candidates={candidateOptions}
            recruiters={recruiters}
            defaultRecruiterId={user.id}
            prefill={
              reqPrefill
                ? {
                    payRate: reqPrefill.payRate,
                    billRate: reqPrefill.billRate,
                    clientRate: reqPrefill.clientRate,
                    engagement: reqPrefill.engagement,
                    vendorRecruiterName: reqPrefill.vendorRecruiterName,
                    teamLead: reqPrefill.teamLead,
                  }
                : undefined
            }
            cancelHref={`/jobs/${job.id}`}
          />
        </div>
      )}
    </div>
  );
}
