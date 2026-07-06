import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { createSubmission } from "@/server/actions/submissions";
import { getCandidateDetail } from "@/server/queries/candidates";
import { listJobOptions } from "@/server/queries/jobs";
import { listUsers } from "@/server/queries/org";
import { formatJobDisplayId } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function NewCandidateSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [candidate, jobs, recruiters, user] = await Promise.all([
    getCandidateDetail(id),
    listJobOptions(),
    listUsers(),
    requireUser(),
  ]);
  if (!candidate) notFound();

  const jobOptions = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    displayId: formatJobDisplayId(j),
    clientName: j.clientName,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/candidates/${candidate.id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to candidate
      </Link>

      <PageHeader
        title="Submit to a job"
        description={`Submit ${candidate.fullName} to an open job.`}
      />

      {jobOptions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No open jobs to submit to right now.{" "}
            <Link
              href="/jobs"
              className="font-medium text-indigo-600 hover:underline"
            >
              Browse jobs
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <SubmissionForm
            action={createSubmission}
            mode="candidate-locked"
            candidate={{
              id: candidate.id,
              fullName: candidate.fullName,
              resumes: candidate.resumes.map((r) => ({
                id: r.id,
                label: r.label,
              })),
            }}
            jobOptions={jobOptions}
            recruiters={recruiters}
            defaultRecruiterId={user.id}
            cancelHref={`/candidates/${candidate.id}`}
          />
        </div>
      )}
    </div>
  );
}
