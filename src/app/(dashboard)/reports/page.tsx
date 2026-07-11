import { PageHeader } from "@/components/ui/page-header";
import { Forbidden, MANAGER_ONLY_FORBIDDEN } from "@/components/ui/forbidden";
import { ReportsTabs, type ReportsTab } from "@/components/reports/reports-tabs";
import { AnalyticsTab } from "@/components/reports/analytics-tab";
import { MonthlyPerformanceTab } from "@/components/reports/monthly-performance-tab";
import { requireUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  if (!isManagerTier(user)) return <Forbidden message={MANAGER_ONLY_FORBIDDEN} />;

  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: ReportsTab = tabParam === "monthly" ? "monthly" : "analytics";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analytics"
        description="Management analysis across jobs, submissions, recruiters, and outcomes."
      />

      <ReportsTabs active={tab} />

      {tab === "monthly" ? (
        <MonthlyPerformanceTab searchParams={sp} />
      ) : (
        <AnalyticsTab searchParams={sp} />
      )}
    </div>
  );
}
