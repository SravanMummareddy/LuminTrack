import { PageHeader } from "@/components/ui/page-header";
import { Forbidden, MANAGER_ONLY_FORBIDDEN } from "@/components/ui/forbidden";
import { requireUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getOrgChart } from "@/server/queries/org-chart";
import { OrgChartFlow } from "@/components/org-chart/org-chart-flow";

export default async function OrgChartPage() {
  const user = await requireUser();
  if (!isManagerTier(user)) return <Forbidden message={MANAGER_ONLY_FORBIDDEN} />;

  const chart = await getOrgChart();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Org chart"
        description="Reporting structure across the company — CEO, managers, team leads, and recruiters."
      />
      <OrgChartFlow nodes={chart.nodes} edges={chart.edges} />
    </div>
  );
}
