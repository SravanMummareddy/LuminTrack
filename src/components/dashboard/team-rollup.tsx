"use client";

import { useState } from "react";
import type { TeamRollup } from "@/server/pending";

/**
 * Wave 7.2b — the manager/admin org oversight. One card per team (open + overdue
 * counts, worst-first), each expanding inline to its per-member breakdown. No
 * navigation — the drill-down is right here, which scales where a flat org-wide
 * item list wouldn't.
 */
export function TeamRollupCards({ teams }: { teams: TeamRollup[] }) {
  if (teams.length === 0)
    return (
      <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
        No teams yet.
      </p>
    );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => (
        <TeamCard key={t.teamId} team={t} />
      ))}
    </div>
  );
}

function TeamCard({ team }: { team: TeamRollup }) {
  const [open, setOpen] = useState(false);
  const accent =
    team.overdue > 0
      ? "border-l-[#d85a30]"
      : team.open > 0
        ? "border-l-amber-400"
        : "border-l-emerald-500";
  return (
    <div className={`rounded-lg border border-l-4 border-slate-200 bg-white ${accent}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3.5 py-3 text-left"
        aria-expanded={open}
      >
        <div className="text-sm font-semibold text-slate-800">{team.teamName}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          Lead: {team.leadName ?? "—"} · {team.memberCount} people
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="rounded-full bg-[#faece7] px-2 py-0.5 text-xs font-bold text-[#712b13]">
            {team.open} open
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              team.overdue > 0
                ? "bg-[#d85a30] text-white"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {team.overdue} overdue
          </span>
          <span className="ml-auto text-xs text-indigo-600">
            {open ? "Hide" : "Members"}
          </span>
        </div>
      </button>
      {open && (
        <ul className="border-t border-slate-100 px-3.5 py-2">
          {team.members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between py-1 text-xs"
            >
              <span className="text-slate-700">{m.name}</span>
              <span className="tabular-nums text-slate-500">
                {m.open} open
                {m.overdue > 0 && (
                  <span className="ml-1 font-semibold text-[#712b13]">
                    · {m.overdue} overdue
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
