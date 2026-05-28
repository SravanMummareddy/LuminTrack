import { getCurrentUser } from "@/lib/session";
import { Forbidden } from "@/components/ui/forbidden";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/server/db";
import { getBackupPreflight } from "@/server/exporters/build-backup-json";
import { ExportForm } from "@/components/settings/export-form";
import { formatDateTime } from "@/lib/format";

export default async function ExportPage() {
  const user = await getCurrentUser();
  if (!user) return <Forbidden message="Sign in required." />;
  if (user.role !== "ADMIN") return <Forbidden />;

  const [{ totals }, history] = await Promise.all([
    getBackupPreflight(),
    prisma.activity.findMany({
      where: { action: "DATA_EXPORTED" },
      include: { performedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Export data"
        description="Automated daily backup is not yet configured. Download a manual snapshot any time."
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <ExportForm totals={totals} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Export history (last 20)
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">No exports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">User</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-600">
                      {formatDateTime(h.createdAt)}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{h.performedBy.fullName}</td>
                    <td className="py-2 pr-4 text-slate-700">{h.description}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {h.note ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
