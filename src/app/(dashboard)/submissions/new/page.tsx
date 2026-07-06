import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { createSubmission } from "@/server/actions/submissions";
import { listCandidateOptions } from "@/server/queries/candidates";
import { listJobOptions } from "@/server/queries/jobs";
import { listUsers, listTeamLeadOptions } from "@/server/queries/org";
import { formatJobDisplayId } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function NewOpenSubmissionPage() {
  const [candidates, jobs, recruiters, user, teamLeads] = await Promise.all([
    listCandidateOptions(),
    listJobOptions(),
    listUsers(),
    requireUser(),
    listTeamLeadOptions(),
  ]);

  const jobOptions = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    displayId: formatJobDisplayId(j),
    clientName: j.clientName,
  }));
  const candidateOptions = candidates.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    resumes: c.resumes,
  }));

  const blocked = jobOptions.length === 0 || candidateOptions.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/submissions"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to submissions
      </Link>

      <PageHeader
        title="New submission"
        description="Submit a candidate to a job. Pick both, then submit."
      />

      {blocked ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            {jobOptions.length === 0 ? (
              <>
                No open jobs to submit to right now.{" "}
                <Link
                  href="/jobs"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Browse jobs
                </Link>
                .
              </>
            ) : (
              <>
                No candidates yet.{" "}
                <Link
                  href="/candidates/new"
                  className="font-medium text-indigo-600 hover:underline"
                >
                  Add a candidate
                </Link>{" "}
                first.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <SubmissionForm
            action={createSubmission}
            mode="open"
            jobOptions={jobOptions}
            candidates={candidateOptions}
            recruiters={recruiters}
            teamLeads={teamLeads}
            defaultRecruiterId={user.id}
            cancelHref="/submissions"
          />
        </div>
      )}
    </div>
  );
}
