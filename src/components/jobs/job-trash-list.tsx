import Link from "next/link";
import { RotateCcw, Download } from "lucide-react";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { buttonClass } from "@/components/ui/button";
import { formatDate, formatJobDisplayId } from "@/lib/format";
import { restoreJobFromTrash } from "@/server/actions/jobs";
import { JobEraseButton } from "@/components/jobs/job-erase-button";

type TrashRow = {
  id: string;
  seq: number;
  title: string;
  portalRefId: string | null;
  deletedAt: Date | null;
  client: { name: string } | null;
};

/**
 * Admin view of trashed jobs with inline Restore + Erase permanently — the
 * trash counterpart to the status-action list (a trashed job can't be
 * reopened/held/closed, only restored to its terminal status or erased).
 * Mirrors CandidateTrashList; erase reuses the type-the-title guard via
 * JobEraseButton. Rows link to the detail page so an admin can review before
 * erasing.
 */
export function JobTrashList({
  rows,
  retentionDays,
}: {
  rows: TrashRow[];
  retentionDays: number;
}) {
  return (
    <Table>
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr>
          <Th>ID</Th>
          <Th>Job</Th>
          <Th>Client</Th>
          <Th>Trashed</Th>
          <Th>Auto-erases</Th>
          <Th />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((j) => {
          const purge = j.deletedAt
            ? new Date(j.deletedAt.getTime() + retentionDays * 86_400_000)
            : null;
          return (
            <tr key={j.id} className="hover:bg-slate-50">
              <Td
                label="ID"
                secondary
                className="whitespace-nowrap font-mono text-xs"
              >
                {formatJobDisplayId(j)}
              </Td>
              <Td heading>
                <Link
                  href={`/jobs/${j.id}`}
                  className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                >
                  {j.title}
                </Link>
              </Td>
              <Td label="Client" secondary>
                {j.client?.name ?? "—"}
              </Td>
              <Td label="Trashed" secondary className="whitespace-nowrap">
                {j.deletedAt ? formatDate(j.deletedAt) : "—"}
              </Td>
              <Td label="Auto-erases" secondary className="whitespace-nowrap">
                {purge ? formatDate(purge) : "—"}
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={`/api/jobs/${j.id}/archive`}
                    className={buttonClass("secondary", "sm")}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Download
                  </a>
                  <form action={restoreJobFromTrash}>
                    <input type="hidden" name="id" value={j.id} />
                    <button type="submit" className={buttonClass("primary", "sm")}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Restore
                    </button>
                  </form>
                  <JobEraseButton
                    jobId={j.id}
                    jobTitle={j.title}
                    size="sm"
                    label="Erase"
                  />
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
