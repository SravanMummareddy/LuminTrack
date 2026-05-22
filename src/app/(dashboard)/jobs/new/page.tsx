import { PageHeader } from "@/components/ui/page-header";
import { JobForm } from "@/components/jobs/job-form";
import { createJob } from "@/server/actions/jobs";
import {
  listClients,
  listVendors,
  listSisterCompanies,
  listUsers,
} from "@/server/queries/org";

export default async function NewJobPage() {
  const [clients, vendors, sources, recruiters] = await Promise.all([
    listClients(),
    listVendors(),
    listSisterCompanies(),
    listUsers(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Add job" description="Create a new job requirement." />
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <JobForm
          action={createJob}
          clients={clients}
          vendors={vendors}
          sources={sources}
          recruiters={recruiters}
          submitLabel="Create job"
        />
      </div>
    </div>
  );
}
