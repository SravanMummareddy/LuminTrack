import {
  SCORECARD_METRICS,
  SCORECARD_METRIC_LABEL,
  type ScorecardMetric,
  type ScorecardRow,
  type MonthlyScorecard,
} from "@/server/queries/monthly-scorecard";

// Compact column headers; full names ride along in `title` for hover/a11y.
const METRIC_ABBR: Record<ScorecardMetric, string> = {
  submissions: "Subs",
  interviews: "Ints",
  newVendors: "Vnds",
  closures: "Cls",
  backouts: "Backs",
};

type Counts = Record<ScorecardMetric, number>;

function zero(): Counts {
  return { submissions: 0, interviews: 0, newVendors: 0, closures: 0, backouts: 0 };
}

/** Column-wise sum of a set of recruiter rows → a synthetic Total row. */
function sumRows(rows: ScorecardRow[], weekCount: number) {
  const weeks: Counts[] = Array.from({ length: weekCount }, zero);
  const total = zero();
  for (const r of rows) {
    for (let w = 0; w < weekCount; w++) {
      for (const m of SCORECARD_METRICS) {
        weeks[w][m] += r.weeks[w][m];
        total[m] += r.weeks[w][m];
      }
    }
  }
  return { weeks, total };
}

/**
 * Monthly Performance scorecard grid. Two-row grouped header (week ranges over
 * the five metric sub-columns, plus a Total group), a sticky recruiter column,
 * and horizontal scroll for wide months. Recruiters are grouped by team with a
 * per-team Total row; a grand Total is appended when more than one team is shown.
 */
export function ScorecardGrid({ scorecard }: { scorecard: MonthlyScorecard }) {
  const { weekLabels, rows } = scorecard;
  const weekCount = weekLabels.length;
  const metricsPerGroup = SCORECARD_METRICS.length;

  // Group recruiters by team, preserving the query's team-then-name ordering.
  const groupOrder: (string | null)[] = [];
  const grouped = new Map<string | null, ScorecardRow[]>();
  for (const r of rows) {
    const key = r.teamLabel ?? null;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      groupOrder.push(key);
    }
    grouped.get(key)!.push(r);
  }
  const multiTeam = groupOrder.length > 1;

  // Header: week groups + a trailing Total group.
  const groupHeaders = [...weekLabels.map((l) => ({ label: l, total: false })), {
    label: "Total",
    total: true,
  }];

  function renderCountsRow(
    counts: { weeks: Counts[]; total: Counts },
    strong: boolean,
  ) {
    return (
      <>
        {counts.weeks.map((wc, wi) => (
          <MetricGroup key={wi} counts={wc} strong={strong} groupStart />
        ))}
        <MetricGroup counts={counts.total} strong={strong} groupStart totalGroup />
      </>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th
              rowSpan={2}
              className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-600"
            >
              Recruiter
            </th>
            {groupHeaders.map((g, i) => (
              <th
                key={i}
                colSpan={metricsPerGroup}
                className={`border-l-2 px-2 py-2 text-center text-xs font-semibold ${
                  g.total
                    ? "border-slate-400 bg-slate-200 text-slate-700"
                    : "border-slate-300 text-slate-600"
                }`}
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            {groupHeaders.map((g, gi) =>
              SCORECARD_METRICS.map((m, mi) => (
                <th
                  key={`${gi}-${m}`}
                  title={SCORECARD_METRIC_LABEL[m]}
                  className={`px-2 py-1 text-right text-[11px] font-medium text-slate-500 ${
                    mi === 0
                      ? g.total
                        ? "border-l-2 border-slate-400"
                        : "border-l-2 border-slate-300"
                      : "border-l border-slate-100"
                  } ${g.total ? "bg-slate-100" : ""}`}
                >
                  {METRIC_ABBR[m]}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {groupOrder.map((team) => {
            const teamRows = grouped.get(team)!;
            const teamTotal = sumRows(teamRows, weekCount);
            return (
              <TeamSection
                key={team ?? "__none__"}
                team={team}
                teamRows={teamRows}
                teamTotal={teamTotal}
                weekCount={weekCount}
                showTeamHeader={multiTeam}
                renderCountsRow={renderCountsRow}
              />
            );
          })}
          {multiTeam && (
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold">
              <td className="sticky left-0 z-10 bg-slate-100 px-3 py-2 text-left text-slate-700">
                All teams — Total
              </td>
              {renderCountsRow(sumRows(rows, weekCount), true)}
            </tr>
          )}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={1 + groupHeaders.length * metricsPerGroup}
                className="px-3 py-8 text-center text-sm text-slate-400"
              >
                No active recruiters to score for this month.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** A group of 5 metric cells (one week, or the Total group). */
function MetricGroup({
  counts,
  strong = false,
  groupStart = false,
  totalGroup = false,
}: {
  counts: Counts;
  strong?: boolean;
  groupStart?: boolean;
  totalGroup?: boolean;
}) {
  return (
    <>
      {SCORECARD_METRICS.map((m, i) => {
        const danger = m === "backouts" && counts[m] > 0;
        const leftBorder =
          i === 0
            ? totalGroup
              ? "border-l-2 border-slate-400"
              : groupStart
                ? "border-l-2 border-slate-300"
                : "border-l border-slate-100"
            : "border-l border-slate-100";
        return (
          <td
            key={m}
            className={`px-2 py-1.5 text-right tabular-nums ${leftBorder} ${
              totalGroup ? "bg-slate-50" : ""
            } ${strong ? "font-semibold" : ""} ${
              danger
                ? "text-red-600"
                : counts[m] === 0
                  ? "text-slate-300"
                  : "text-slate-700"
            }`}
          >
            {counts[m] === 0 ? "—" : counts[m]}
          </td>
        );
      })}
    </>
  );
}

function TeamSection({
  team,
  teamRows,
  teamTotal,
  weekCount,
  showTeamHeader,
  renderCountsRow,
}: {
  team: string | null;
  teamRows: ScorecardRow[];
  teamTotal: { weeks: Counts[]; total: Counts };
  weekCount: number;
  showTeamHeader: boolean;
  renderCountsRow: (
    c: { weeks: Counts[]; total: Counts },
    strong: boolean,
  ) => React.ReactNode;
}) {
  const colCount = 1 + (weekCount + 1) * SCORECARD_METRICS.length;
  return (
    <>
      {showTeamHeader && (
        <tr className="bg-indigo-50/60">
          <td
            colSpan={colCount}
            className="sticky left-0 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-indigo-700"
          >
            {team ?? "Unassigned"}
          </td>
        </tr>
      )}
      {teamRows.map((r) => (
        <tr key={r.recruiterId} className="border-t border-slate-100 hover:bg-slate-50">
          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left">
            <span className="font-medium text-slate-800">{r.recruiterName}</span>
            {r.empId && (
              <span className="ml-1 font-mono text-[11px] text-slate-400">
                {r.empId}
              </span>
            )}
          </td>
          {renderCountsRow({ weeks: r.weeks, total: r.total }, false)}
        </tr>
      ))}
      <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold">
        <td className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 text-left text-slate-600">
          {showTeamHeader ? `${team ?? "Unassigned"} — Total` : "Total"}
        </td>
        {renderCountsRow(teamTotal, true)}
      </tr>
    </>
  );
}
