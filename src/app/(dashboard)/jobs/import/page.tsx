import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { ImportRequisitions } from "@/components/jobs/import-requisitions";

export default async function ImportJobsPage() {
  const user = await requireUser();
  if (!hasFullAccess(user)) return <Forbidden />;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/jobs/imports"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to import history
      </Link>
      <PageHeader
        title="Import requisitions from iLabor"
        description="Upload a JSON file captured by the Randstad iLabor browser extension. We'll preview the changes before anything is written."
      />
      <ImportRequisitions />
    </div>
  );
}
