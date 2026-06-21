import Link from "next/link";
import { Table, Th, Td, cardLink, cardLinkRaise } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Badge } from "@/components/ui/badge";
import {
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_RESULT_TONE,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import type { InterviewListRow } from "@/server/queries/interviews";

function technology(c: InterviewListRow["submission"]["candidate"]): string {
  return c.featuredSkills[0] ?? c.skills[0] ?? "—";
}

export function InterviewsTable({
  rows,
  pageOffset = 0,
}: {
  rows: InterviewListRow[];
  pageOffset?: number;
}) {
  return (
    <Table>
      <thead className="border-b border-slate-200 bg-slate-50">
        <tr>
          <Th className="text-right">S.No</Th>
          <SortableHeader column="date" label="Date of interview" defaultDir="desc" />
          <SortableHeader column="candidate" label="Candidate" />
          <SortableHeader column="client" label="Client" />
          <Th>Sales recruiter</Th>
          <Th>Technology</Th>
          <Th>Round</Th>
          <Th>Result</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, idx) => {
          const c = r.submission.candidate;
          return (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td label="S.No" secondary className="text-right tabular-nums">
                {pageOffset + idx + 1}
              </Td>
              <Td label="Date of interview" secondary className="whitespace-nowrap">
                {r.scheduledAt ? formatDateTime(r.scheduledAt) : "—"}
              </Td>
              <Td heading>
                <Link
                  href={`/candidates/${c.id}`}
                  className={`${cardLink} font-medium text-indigo-600 hover:underline`}
                >
                  {c.fullName}
                </Link>
              </Td>
              <Td label="Client" secondary>
                {r.submission.job.client.name}
              </Td>
              <Td label="Sales recruiter" secondary>
                {r.submission.submittedBy.fullName}
              </Td>
              <Td label="Technology" secondary>
                {technology(c)}
              </Td>
              <Td label="Round" secondary>
                <Link
                  href={`/submissions/${r.submission.id}`}
                  className={`${cardLinkRaise} text-slate-700 hover:underline`}
                >
                  {r.roundName}
                </Link>
                <span className="ml-1 text-xs text-slate-400">
                  · {INTERVIEW_TYPE_LABEL[r.interviewType]}
                </span>
              </Td>
              <Td label="Result">
                <Badge tone={INTERVIEW_RESULT_TONE[r.result]}>
                  {INTERVIEW_RESULT_LABEL[r.result]}
                </Badge>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
