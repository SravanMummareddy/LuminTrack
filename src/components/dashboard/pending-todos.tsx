"use client";

import { useState } from "react";
import Link from "next/link";
import type { TodoItem, TodoUrgency } from "@/server/pending";

const TIERS: { key: TodoUrgency; label: string; dot: string }[] = [
  { key: "overdue", label: "Overdue — needs action now", dot: "bg-[#d85a30]" },
  { key: "soon", label: "Coming up this week", dot: "bg-amber-500" },
  { key: "backlog", label: "Backlog nudges", dot: "bg-slate-400" },
];

const COLLAPSED = 5;

/**
 * Wave 7.2 — the urgency-tiered "Needs attention" render. Consumes the grouped
 * output of `getPendingTodos` (grouped server-side so this stays a type-only
 * import). `showOwner` tags each item with whose it is — on in the team/org view.
 */
export function PendingTodos({
  grouped,
  showOwner = false,
}: {
  grouped: Record<TodoUrgency, TodoItem[]>;
  showOwner?: boolean;
}) {
  const total =
    grouped.overdue.length + grouped.soon.length + grouped.backlog.length;
  if (total === 0)
    return (
      <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
        Nothing pending — you&apos;re all caught up.
      </p>
    );

  return (
    <div className="space-y-5">
      {TIERS.map((tier) =>
        grouped[tier.key].length > 0 ? (
          <Tier
            key={tier.key}
            label={tier.label}
            dot={tier.dot}
            items={grouped[tier.key]}
            showOwner={showOwner}
          />
        ) : null,
      )}
    </div>
  );
}

function Tier({
  label,
  dot,
  items,
  showOwner,
}: {
  label: string;
  dot: string;
  items: TodoItem[];
  showOwner: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, COLLAPSED);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-bold tracking-tight text-slate-800">{label}</h3>
        <span className="text-xs font-semibold text-slate-400">{items.length}</span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {shown.map((it, i) => (
          <li key={i}>
            <Link
              href={it.href}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {it.primary}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {it.secondary}
                </span>
              </span>
              {showOwner && (
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {it.ownerName}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs text-indigo-600 hover:underline"
        >
          {expanded ? "See less" : `See all ${items.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * The team view's per-member count strip — "who's drowning". Sorted worst-first
 * upstream; a zero count reads as all-clear (green).
 */
export function MemberCountStrip({
  members,
}: {
  members: { id: string; name: string; count: number; isSelf: boolean }[];
}) {
  if (members.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
        >
          <span className="text-xs font-medium text-slate-700">
            {m.name}
            {m.isSelf && <span className="text-slate-400"> (you)</span>}
          </span>
          <span
            className={`rounded-full px-1.5 text-xs font-bold ${
              m.count === 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-[#faece7] text-[#712b13]"
            }`}
          >
            {m.count}
          </span>
        </div>
      ))}
    </div>
  );
}
