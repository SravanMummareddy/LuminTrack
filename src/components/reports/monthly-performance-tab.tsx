import { ScorecardPicker } from "@/components/reports/scorecard-picker";
import { ScorecardGrid } from "@/components/reports/scorecard-grid";
import {
  getMonthlyScorecard,
  SCORECARD_METRIC_LABEL,
} from "@/server/queries/monthly-scorecard";
import { listTeamLabels } from "@/server/queries/org";

type SearchParams = { [key: string]: string | string[] | undefined };

function clean(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : undefined;
}

/** Parse `?month=YYYY-MM` into {year, monthIndex}. Falls back to the current
 *  month on a missing or malformed value. */
function parseMonth(raw: string | undefined): { year: number; monthIndex: number } {
  const now = new Date();
  const fallback = { year: now.getFullYear(), monthIndex: now.getMonth() };
  if (!raw) return fallback;
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return fallback;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return fallback;
  return { year, monthIndex };
}

export async function MonthlyPerformanceTab({
  searchParams: sp,
}: {
  searchParams: SearchParams;
}) {
  const { year, monthIndex } = parseMonth(clean(sp.month));
  const team = clean(sp.team) ?? "";

  const [scorecard, teamLabels] = await Promise.all([
    getMonthlyScorecard({ year, monthIndex, teamLabel: team || undefined }),
    listTeamLabels(),
  ]);

  const monthValue = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const legend = Object.values(SCORECARD_METRIC_LABEL).join(" · ");

  return (
    <div className="space-y-4">
      <ScorecardPicker month={monthValue} team={team} teamLabels={teamLabels} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          {scorecard.monthLabel}
          {team && (
            <span className="ml-2 text-xs font-normal text-slate-400">· {team}</span>
          )}
        </h2>
        <p className="text-xs text-slate-400">
          Per recruiter, by week — {legend}
        </p>
      </div>

      <ScorecardGrid scorecard={scorecard} />

      <p className="text-xs text-slate-400">
        Submissions &amp; Backouts are counted on the submission date; Interviews
        on the scheduled date; Closures on the placement start date; New vendors
        when the company first ever submits to a vendor (credited to whoever made
        that first submission).
      </p>
    </div>
  );
}
