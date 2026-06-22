import { PageHeader } from "@/components/ui/page-header";
import { BenchConsultantForm } from "@/components/bench/bench-consultant-form";
import { createBenchConsultant } from "@/server/actions/bench-consultants";
import { listActiveRecruiterOptions } from "@/server/queries/org";
import { listCandidateOptions } from "@/server/queries/candidates";
import { requireUser } from "@/lib/session";
import { canViewBenchCredentials } from "@/lib/permissions";

export default async function NewBenchConsultantPage() {
  const user = await requireUser();
  const [recruiters, candidates] = await Promise.all([
    listActiveRecruiterOptions(),
    listCandidateOptions(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Add bench consultant"
        description="Add a consultant to the marketing roster."
      />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <BenchConsultantForm
          action={createBenchConsultant}
          submitLabel="Add consultant"
          recruiters={recruiters}
          candidates={candidates}
          canEditCredentials={canViewBenchCredentials(user)}
        />
      </div>
    </div>
  );
}
