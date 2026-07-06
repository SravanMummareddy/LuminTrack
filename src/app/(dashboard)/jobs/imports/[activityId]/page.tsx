import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Table, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";

type Summary = {
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  erroredCount?: number;
  statusWarningCount?: number;
  capturedAt?: string;
  runStartedAt?: string;
};

/**
 * Per-run drill-down for an iLabor import. Reads the REQUISITIONS_IMPORTED
 * Activity row by id, then groups every JOB_IMPORTED / JOB_UPDATED row
 * stamped with `note = "importRunId:<id>"` so the operator can see exactly
 * which jobs the run touched and what diff fired on each.
 */
export default async function ImportRunDetailPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const user = await requireUser();
  if (!hasFullAccess(user)) return <Forbidden />;

  const { activityId } = await params;

  const runRow = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { performedBy: { select: { fullName: true } } },
  });
  if (!runRow || runRow.action !== "REQUISITIONS_IMPORTED") notFound();

  const summary: Summary = (() => {
    if (!runRow.newValue) return {};
    try {
      return JSON.parse(runRow.newValue) as Summary;
    } catch {
      return {};
    }
  })();

  const runNote = `importRunId:${activityId}`;
  const rows = await prisma.activity.findMany({
    where: {
      note: runNote,
      action: { in: ["JOB_IMPORTED", "JOB_UPDATED"] },
    },
    include: {
      job: {
        select: {
          id: true,
          seq: true,
          title: true,
          portalRefId: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: [{ action: "asc" }, { createdAt: "asc" }],
  });

  const createdRows = rows.filter((r) => r.action === "JOB_IMPORTED");
  const updatedRows = rows.filter((r) => r.action === "JOB_UPDATED");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/jobs/imports"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to import history
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Import change log"
          description={`Every job touched by the iLabor import on ${formatDateTime(runRow.createdAt)}.`}
        />
        <div className="flex gap-2">
          <a
            href={`/api/jobs/imports/${activityId}/changelog?format=txt`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download .txt
          </a>
          <a
            href={`/api/jobs/imports/${activityId}/changelog?format=csv`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download .csv
          </a>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Summary</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="text-xs text-slate-500">Run by</dt>
            <dd className="text-slate-800">{runRow.performedBy?.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Imported at</dt>
            <dd className="text-slate-800">{formatDateTime(runRow.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Captured at</dt>
            <dd className="text-slate-800">
              {summary.capturedAt ? formatDateTime(summary.capturedAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">New</dt>
            <dd className="tabular-nums text-slate-800">{summary.createdCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Changed</dt>
            <dd className="tabular-nums text-slate-800">{summary.updatedCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Unchanged</dt>
            <dd className="tabular-nums text-slate-800">{summary.unchangedCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Skipped</dt>
            <dd className="tabular-nums text-slate-800">{summary.erroredCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status warnings</dt>
            <dd className="tabular-nums text-slate-800">
              {summary.statusWarningCount ?? 0}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Changed jobs ({updatedRows.length})
        </h2>
        {updatedRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No job header fields changed in this run.
          </p>
        ) : (
          <Table>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Job</Th>
                <Th>Client</Th>
                <Th>What changed</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {updatedRows.map((r) => {
                const desc = r.description.startsWith("iLabor re-import: ")
                  ? r.description.slice("iLabor re-import: ".length)
                  : r.description;
                const diffs = desc.split(";").map((d) => d.trim()).filter(Boolean);
                return (
                  <tr key={r.id} className="align-top hover:bg-slate-50">
                    <Td label="Job" className="whitespace-nowrap">
                      {r.job ? (
                        <Link
                          href={`/jobs/${r.job.id}`}
                          className="text-slate-800 hover:underline"
                        >
                          <span className="font-mono text-xs text-slate-500">
                            {r.job.portalRefId
                              ? `REQ-${r.job.portalRefId}`
                              : `JOB-${String(r.job.seq).padStart(5, "0")}`}
                          </span>{" "}
                          {r.job.title}
                        </Link>
                      ) : (
                        <span className="text-slate-400">(job deleted)</span>
                      )}
                    </Td>
                    <Td label="Client">{r.job?.client.name ?? "—"}</Td>
                    <Td label="What changed">
                      <ul className="list-disc pl-4 text-xs text-slate-700">
                        {diffs.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">
          New jobs ({createdRows.length})
        </h2>
        {createdRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No new jobs in this run.
          </p>
        ) : (
          <ul className="space-y-1 rounded-md border border-slate-200 bg-white p-3 text-sm">
            {createdRows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                {r.job ? (
                  <Link href={`/jobs/${r.job.id}`} className="hover:underline">
                    <span className="font-mono text-xs text-slate-500">
                      {r.job.portalRefId
                        ? `REQ-${r.job.portalRefId}`
                        : `JOB-${String(r.job.seq).padStart(5, "0")}`}
                    </span>{" "}
                    <span className="text-slate-800">{r.job.title}</span>
                  </Link>
                ) : (
                  <span className="text-slate-400">(job deleted)</span>
                )}
                <Badge tone="slate">{r.job?.client.name ?? "—"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
