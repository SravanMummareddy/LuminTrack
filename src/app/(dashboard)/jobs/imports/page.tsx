import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { LinkButton } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { requireUser } from "@/lib/session";
import { listIlaborImports } from "@/server/queries/jobs";
import { formatDateTime } from "@/lib/format";

/**
 * Bulk-import history. One row per import RUN — i.e. one
 * REQUISITIONS_IMPORTED audit entry. The counts come from the JSON summary
 * persisted on Activity.newValue by importRequisitions.
 */
type SummaryShape = {
  createdCount?: number;
  updatedCount?: number;
  erroredCount?: number;
  statusWarningCount?: number;
  capturedAt?: string;
};

function parseSummary(raw: string | null): SummaryShape | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SummaryShape;
  } catch {
    return null;
  }
}

export default async function ImportsHistoryPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") return <Forbidden />;

  const imports = await listIlaborImports();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Import history"
          description="Every bulk requisition import, newest first. Counts come from the import summary recorded at the time."
        />
        <LinkButton href="/jobs/import" variant="secondary">
          <Download className="h-4 w-4" />
          New import
        </LinkButton>
      </div>

      {imports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            No imports have been run yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {imports.length} import{imports.length === 1 ? "" : "s"}
          </p>
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>When</Th>
                <Th>By</Th>
                <Th className="text-right">New</Th>
                <Th className="text-right">Updated</Th>
                <Th className="text-right">Skipped</Th>
                <Th className="text-right">Status warnings</Th>
                <Th>Captured at</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {imports.map((row) => {
                const s = parseSummary(row.newValue);
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <Td label="When" className="whitespace-nowrap">
                      {formatDateTime(row.createdAt)}
                    </Td>
                    <Td label="By">{row.performedBy?.fullName ?? "—"}</Td>
                    <Td label="New" className="text-right tabular-nums">
                      {s?.createdCount ?? "—"}
                    </Td>
                    <Td label="Updated" className="text-right tabular-nums">
                      {s?.updatedCount ?? "—"}
                    </Td>
                    <Td label="Skipped" className="text-right tabular-nums">
                      {s?.erroredCount ?? "—"}
                    </Td>
                    <Td
                      label="Status warnings"
                      className="text-right tabular-nums"
                    >
                      {s?.statusWarningCount ?? "—"}
                    </Td>
                    <Td
                      label="Captured at"
                      secondary
                      className="whitespace-nowrap"
                    >
                      {s?.capturedAt ? formatDateTime(s.capturedAt) : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="pt-2 text-xs text-slate-400">
            “Captured at” is the timestamp recorded by the browser extension
            (or the moment a raw network capture was uploaded). “When” is when
            the import was actually applied to LuminTrack.
          </p>
        </div>
      )}
    </div>
  );
}
