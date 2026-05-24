import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/session";
import { ImportRequisitions } from "@/components/jobs/import-requisitions";

export default async function ImportJobsPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Import requisitions from iLabor"
        description="Upload a JSON file captured by the Randstad iLabor browser extension. We'll preview the changes before anything is written."
      />
      <ImportRequisitions />
    </div>
  );
}
