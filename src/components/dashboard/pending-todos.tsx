"use client";

import { useState } from "react";
import Link from "next/link";
import type { TodoItem, TodoUrgency } from "@/server/pending";
import type { Scope } from "@/server/pending-scope";

const TIERS: {
  key: TodoUrgency;
  label: string;
  dot: string;
  pill: string;
  pillOn: string;
}[] = [
  {
    key: "overdue",
    label: "Overdue",
    dot: "bg-[#d85a30]",
    pill: "border-[#d85a30] text-[#b1471f]",
    pillOn: "bg-[#fdf2ee]",
  },
  {
    key: "soon",
    label: "This week",
    dot: "bg-amber-500",
    pill: "border-amber-500 text-amber-700",
    pillOn: "bg-amber-50",
  },
  {
    key: "backlog",
    label: "Backlog",
    dot: "bg-slate-400",
    pill: "border-slate-300 text-slate-600",
    pillOn: "bg-slate-100",
  },
];

// Top-N shown on the dashboard card per tier; the tail lives on the full
// /todos list page (the card is a glance, not the workspace).
const CARD_CAP = 3;
const FOCUS_CAP = 8;
const DOCS_CAP = 4;
const DAY = 86_400_000;

/** Days a still-open overdue item is past its driving date, from a server-fixed
 *  `now` (passed as a prop so server + client compute the same badge — no
 *  hydration drift). */
function overdueDays(at: number, now: number): number {
  return Math.floor((now - at) / DAY);
}

function todosHref(scope: Scope, filter: string): string {
  const qs = new URLSearchParams();
  if (scope !== "me") qs.set("scope", scope);
  if (filter !== "all") qs.set("filter", filter);
  const s = qs.toString();
  return s ? `/todos?${s}` : "/todos";
}

/**
 * WS2 — the "Needs attention" card (Pattern A: summary pills that double as
 * filters + top-N per tier). Consumes the grouped output of `getPendingTodos`.
 * Expiring documents are pulled into their own grouped section. `showOwner` tags
 * each item with whose it is (team/org view). `now` is the server render time so
 * the age badge is hydration-stable. "View all" opens the full `/todos` page.
 */
export function PendingTodos({
  grouped,
  showOwner = false,
  scope = "me",
  now,
}: {
  grouped: Record<TodoUrgency, TodoItem[]>;
  showOwner?: boolean;
  scope?: Scope;
  now: number;
}) {
  const [filter, setFilter] = useState<"all" | TodoUrgency>("all");

  // Expiring documents render as their own grouped section, out of the tiers.
  const isDoc = (it: TodoItem) => it.kind === "doc_expiring";
  const tiers: Record<TodoUrgency, TodoItem[]> = {
    overdue: grouped.overdue.filter((it) => !isDoc(it)),
    soon: grouped.soon.filter((it) => !isDoc(it)),
    backlog: grouped.backlog.filter((it) => !isDoc(it)),
  };
  const docs = [...grouped.overdue, ...grouped.soon, ...grouped.backlog].filter(
    isDoc,
  );
  const tierTotal =
    tiers.overdue.length + tiers.soon.length + tiers.backlog.length;

  if (tierTotal === 0 && docs.length === 0)
    return (
      <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
        You&apos;re all clear — nothing pending. ✓
      </p>
    );

  const shownTiers = TIERS.filter(
    (t) => tiers[t.key].length > 0 && (filter === "all" || filter === t.key),
  );

  return (
    <div className="space-y-3">
      {/* Summary pills — also the tier filters (click to focus, click again to reset). */}
      {tierTotal > 0 && (
        <div className="flex flex-wrap gap-2">
          <FilterPill
            active={filter === "all"}
            onClick={() => setFilter("all")}
            className="border-slate-300 text-slate-600"
            activeClassName="bg-indigo-50 border-indigo-500 text-indigo-700"
            label="All"
            count={tierTotal}
          />
          {TIERS.map((t) =>
            tiers[t.key].length > 0 ? (
              <FilterPill
                key={t.key}
                active={filter === t.key}
                onClick={() => setFilter((f) => (f === t.key ? "all" : t.key))}
                className={t.pill}
                activeClassName={t.pillOn}
                dot={t.dot}
                label={t.label}
                count={tiers[t.key].length}
              />
            ) : null,
          )}
        </div>
      )}

      {shownTiers.map((t) => {
        const items = tiers[t.key];
        const focused = filter === t.key;
        const cap = focused ? FOCUS_CAP : CARD_CAP;
        return (
          <div key={t.key}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${t.dot}`} />
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t.label}
              </h3>
              <span className="text-xs font-semibold text-slate-400">
                {items.length}
              </span>
            </div>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
              {items.slice(0, cap).map((it, i) => (
                <TodoRow
                  key={i}
                  item={it}
                  showOwner={showOwner}
                  overdueDays={
                    t.key === "overdue" ? overdueDays(it.at, now) : null
                  }
                />
              ))}
            </ul>
            {items.length > cap && (
              <Link
                href={todosHref(scope, t.key)}
                className="mt-1.5 inline-block text-xs font-medium text-indigo-600 hover:underline"
              >
                View all {items.length} →
              </Link>
            )}
          </div>
        );
      })}

      {docs.length > 0 && (filter === "all" || filter === "overdue") && (
        <DocsSection docs={docs} scope={scope} showOwner={showOwner} />
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  className,
  activeClassName,
  dot,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  className: string;
  activeClassName: string;
  dot?: string;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${className} ${
        active ? activeClassName : "bg-white opacity-80 hover:opacity-100"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function TodoRow({
  item,
  showOwner,
  overdueDays,
}: {
  item: TodoItem;
  showOwner: boolean;
  overdueDays: number | null;
}) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800">
            {item.primary}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {item.secondary}
          </span>
        </span>
        {overdueDays != null && overdueDays >= 1 && (
          <span className="shrink-0 text-xs font-bold text-[#b1471f]">
            {overdueDays}d
          </span>
        )}
        {showOwner && (
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
            {item.ownerName}
          </span>
        )}
      </Link>
    </li>
  );
}

function DocsSection({
  docs,
  scope,
  showOwner,
}: {
  docs: TodoItem[];
  scope: Scope;
  showOwner: boolean;
}) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 p-2.5">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          📄 Documents expiring
        </h3>
        <span className="text-xs font-semibold text-slate-400">{docs.length}</span>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 bg-white">
        {docs.slice(0, DOCS_CAP).map((it, i) => (
          <TodoRow key={i} item={it} showOwner={showOwner} overdueDays={null} />
        ))}
      </ul>
      {docs.length > DOCS_CAP && (
        <Link
          href={todosHref(scope, "docs")}
          className="mt-1.5 inline-block px-1 text-xs font-medium text-indigo-600 hover:underline"
        >
          View all {docs.length} →
        </Link>
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
