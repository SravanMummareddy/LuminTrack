import Link from "next/link";
import { RotateCcw, Download } from "lucide-react";
import { Table, Th, Td, cardLink } from "@/components/ui/table";
import { buttonClass } from "@/components/ui/button";
import { formatDate, formatCandidateDisplayId } from "@/lib/format";
import { restoreCandidateFromTrash } from "@/server/actions/candidates";

type TrashRow = {
  id: string;
  seq: number;
  fullName: string;
  deletedAt: Date | null;
};

/**
 * Admin view of trashed candidates with inline Restore. Restore is a plain
 * server action, so this stays a server component (each row posts its own form).
 * "Erase now" lives on the candidate detail page (it needs the type-name guard).
 */
export function CandidateTrashList({
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
          <Th>Candidate</Th>
          <Th>Deleted</Th>
          <Th>Auto-erases</Th>
          <Th />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((c) => {
          const purge = c.deletedAt
            ? new Date(c.deletedAt.getTime() + retentionDays * 86_400_000)
            : null;
          return (
            <tr key={c.id} className="hover:bg-slate-50">
              <Td
                label="ID"
                secondary
                className="whitespace-nowrap font-mono text-xs"
              >
                {formatCandidateDisplayId(c)}
              </Td>
              <Td heading>
                <Link
                  href={`/candidates/${c.id}`}
                  className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                >
                  {c.fullName}
                </Link>
              </Td>
              <Td label="Deleted" secondary className="whitespace-nowrap">
                {c.deletedAt ? formatDate(c.deletedAt) : "—"}
              </Td>
              <Td label="Auto-erases" secondary className="whitespace-nowrap">
                {purge ? formatDate(purge) : "—"}
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={`/api/candidates/${c.id}/archive`}
                    className={buttonClass("secondary", "sm")}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Archive
                  </a>
                  <form action={restoreCandidateFromTrash}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className={buttonClass("primary", "sm")}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Restore
                    </button>
                  </form>
                </div>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
