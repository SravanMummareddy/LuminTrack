import Link from "next/link";

/**
 * Month + team picker for the Monthly Performance tab. A plain GET form — no
 * client JS. The hidden `tab=monthly` keeps us on this tab when the form posts
 * back, and a native `<input type="month">` yields the `YYYY-MM` we parse.
 */
export function ScorecardPicker({
  month, // "YYYY-MM"
  team, // selected team id ("" = all)
  teams,
}: {
  month: string;
  team: string;
  teams: { id: string; name: string }[];
}) {
  return (
    <form
      method="get"
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3"
    >
      <input type="hidden" name="tab" value="monthly" />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Month</span>
        <input
          type="month"
          name="month"
          defaultValue={month}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Team</span>
        <select
          name="team"
          defaultValue={team}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          disabled={teams.length === 0}
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Apply
        </button>
        <Link
          href="/reports?tab=monthly"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          This month
        </Link>
      </div>
    </form>
  );
}
