import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { RequirementForm } from "@/components/vendor-portal/requirement-form";
import { createVendorRequirement } from "@/server/actions/requirements";
import { listCandidateOptions } from "@/server/queries/candidates";
import { listJobOptions } from "@/server/queries/jobs";
import { listUsers, listTeamLeadOptions } from "@/server/queries/org";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/lib/session";
import { canManageRequirements } from "@/lib/permissions";
import { formatJobDisplayId } from "@/lib/format";

export default async function NewRequirementPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!canManageRequirements(user ?? undefined)) redirect("/vendor-portal");

  const { jobId } = await searchParams;

  // Step 1 — no job chosen yet: a small job picker.
  if (!jobId) {
    const jobs = await listJobOptions();
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/vendor-portal"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requirements
        </Link>
        <PageHeader
          title="New requirement"
          description="Pick the job (vendor requirement) you're planning for."
        />
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">
              No open jobs to plan against.{" "}
              <Link href="/jobs" className="font-medium text-indigo-600 hover:underline">
                Browse jobs
              </Link>
              .
            </p>
          </div>
        ) : (
          <form method="get" className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Job</span>
              <select
                name="jobId"
                required
                defaultValue=""
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select a job…
                </option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.clientName ? ` — ${j.clientName}` : ""} (
                    {formatJobDisplayId(j)})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Continue
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // Step 2 — job chosen: the requirement form.
  const [job, candidates, recruiters, teamLeads] = await Promise.all([
    prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        seq: true,
        portalRefId: true,
        location: true,
        clientRate: true,
        vendorRate: true,
        client: { select: { name: true } },
      },
    }),
    listCandidateOptions(),
    listUsers(),
    listTeamLeadOptions(),
  ]);
  if (!job) redirect("/vendor-portal/new");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/vendor-portal"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to requirements
      </Link>
      <PageHeader
        title="New requirement"
        description="Decide the commercial terms now; a recruiter moves it to a submission later."
      />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <RequirementForm
          action={createVendorRequirement}
          mode="create"
          job={{
            id: job.id,
            title: job.title,
            displayId: formatJobDisplayId(job),
            clientName: job.client?.name ?? null,
            location: job.location,
          }}
          candidates={candidates.map((c) => ({ id: c.id, fullName: c.fullName }))}
          recruiters={recruiters.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            isActive: r.isActive,
          }))}
          teamLeads={teamLeads}
          defaults={{
            location: job.location ?? "",
            // Carry the job's Client rate into the requirement (editable) so it
            // isn't re-typed by hand — the rate chain starts on the Job.
            clientRate: job.clientRate != null ? String(job.clientRate) : "",
            // The job's Vendor rate is the job-level bill rate — seed the
            // requirement's Bill rate from it (editable per-candidate).
            billRate: job.vendorRate != null ? String(job.vendorRate) : "",
          }}
          cancelHref="/vendor-portal"
        />
      </div>
    </div>
  );
}
