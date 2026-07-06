import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { LinkButton } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { listIlaborImports, listStaleIlaborJobs } from "@/server/queries/jobs";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * Bulk-import history. One row per import RUN — i.e. one
 * REQUISITIONS_IMPORTED audit entry. The counts come from the JSON summary
 * persisted on Activity.newValue by importRequisitions.
 */
type SummaryShape = {
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
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
  if (!hasFullAccess(user)) return <Forbidden />;

  const [imports, stale] = await Promise.all([
    listIlaborImports(),
    listStaleIlaborJobs(),
  ]);

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

      {stale.rows.length > 0 && stale.lastImportAt ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Stale iLabor jobs ({stale.rows.length})
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            These OPEN / On-hold jobs came from iLabor at some point but did
            <strong> not</strong> appear in the most recent import on{" "}
            {formatDateTime(stale.lastImportAt)}. Likely either deleted on
            iLabor&apos;s side, or simply not in the latest capture — review
            and close manually if no longer being filled.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {stale.rows.slice(0, 20).map((j) => (
              <li key={j.id} className="flex flex-wrap items-baseline gap-2">
                <Link
                  href={`/jobs/${j.id}`}
                  className="font-mono text-xs text-amber-900 hover:underline"
                >
                  JOB-{String(j.seq).padStart(5, "0")}
                </Link>
                <span className="text-amber-900">{j.title}</span>
                <span className="text-xs text-amber-700">
                  · {j.client.name} · last seen{" "}
                  {j.lastImportedAt ? formatDate(j.lastImportedAt) : "—"}
                </span>
              </li>
            ))}
            {stale.rows.length > 20 ? (
              <li className="text-xs text-amber-700">
                + {stale.rows.length - 20} more not shown.
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

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
                <Th className="text-right">Unchanged</Th>
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
                      <Link
                        href={`/jobs/imports/${row.id}`}
                        className="text-slate-700 hover:text-slate-900 hover:underline"
                      >
                        {formatDateTime(row.createdAt)}
                      </Link>
                    </Td>
                    <Td label="By">{row.performedBy?.fullName ?? "—"}</Td>
                    <Td label="New" className="text-right tabular-nums">
                      {s?.createdCount ?? "—"}
                    </Td>
                    <Td label="Updated" className="text-right tabular-nums">
                      {s?.updatedCount ?? "—"}
                    </Td>
                    <Td label="Unchanged" className="text-right tabular-nums">
                      {s?.unchangedCount ?? "—"}
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
