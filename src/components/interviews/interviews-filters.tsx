import { FilterBar, type FilterDef } from "@/components/ui/filter-bar";
import {
  INTERVIEW_RESULTS,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABEL,
  DISCIPLINES,
  DISCIPLINE_LABEL,
} from "@/lib/labels";

/**
 * Interviews list filters as the shared pill `FilterBar`. Date + recruiter +
 * the interview's own attributes (result, round type) and the candidate's
 * discipline — all multi-select so a worklist can be sliced (e.g. "Waiting
 * final rounds").
 */
export function InterviewsFilters({
  recruiters,
}: {
  recruiters: { id: string; fullName: string }[];
}) {
  const filters: FilterDef[] = [
    { kind: "date", label: "Interview date", primary: true },
    {
      kind: "select",
      param: "recruiterId",
      label: "Sales recruiter",
      primary: true,
      searchable: true,
      multi: true,
      options: [
        { value: "", label: "All recruiters" },
        ...recruiters.map((r) => ({ value: r.id, label: r.fullName })),
      ],
    },
    {
      kind: "select",
      param: "result",
      label: "Result",
      primary: true,
      multi: true,
      options: [
        { value: "", label: "All results" },
        ...INTERVIEW_RESULTS.map((r) => ({
          value: r,
          label: INTERVIEW_RESULT_LABEL[r],
        })),
      ],
    },
    {
      kind: "select",
      param: "roundType",
      label: "Round type",
      primary: true,
      multi: true,
      options: [
        { value: "", label: "All round types" },
        ...INTERVIEW_TYPES.map((t) => ({
          value: t,
          label: INTERVIEW_TYPE_LABEL[t],
        })),
      ],
    },
    {
      kind: "select",
      param: "discipline",
      label: "Discipline",
      multi: true,
      options: [
        { value: "", label: "All disciplines" },
        ...DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_LABEL[d] })),
      ],
    },
  ];

  return (
    <FilterBar
      basePath="/interviews"
      search={{ param: "q", placeholder: "Candidate, job, or client…" }}
      filters={filters}
      viewsKey="lumintrack.interviews.views"
    />
  );
}
