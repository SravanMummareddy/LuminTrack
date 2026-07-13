import Link from "next/link";
import { getCurrentUser, getScopedPrisma } from "@/lib/session";
import { canViewSensitiveDocs, hasFullAccess } from "@/lib/permissions";
import { resolveTodoScope } from "@/server/pending-scope";
import {
  getPendingTodos,
  getManagerActionItems,
  groupByUrgency,
  type TodoItem,
  type TodoUrgency,
} from "@/server/pending";
import { BackLink } from "@/components/ui/back-link";

export const metadata = { title: "To-dos · LuminTrack" };

const TIER_META: Record<TodoUrgency, { label: string; dot: string }> = {
  overdue: { label: "Overdue", dot: "bg-[#d85a30]" },
  soon: { label: "This week", dot: "bg-amber-500" },
  backlog: { label: "Backlog", dot: "bg-slate-400" },
};

const DAY = 86_400_000;
const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;
const isDoc = (it: TodoItem) => it.kind === "doc_expiring";

/**
 * WS2 — the full pending-todo list behind the dashboard card's "View all". Same
 * scope + data (`getPendingTodos`), uncapped, filterable by tier or the expiring-
 * documents group via `?filter=`. Scope carries through `?scope=` so a lead/
 * manager's drill-in stays in context.
 */
export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const db = await getScopedPrisma();
  const { scope, memberIds } = await resolveTodoScope(db, user, first(sp.scope));

  // Whose todos: the team's members, the whole org (manager oversight), or you.
  const userIds =
    scope === "team"
      ? memberIds
      : scope === "org"
        ? (await db.user.findMany({ select: { id: true } })).map((u) => u.id)
        : user
          ? [user.id]
          : [];

  const [todos, managerItems] = await Promise.all([
    user
      ? getPendingTodos(db, userIds, {
          canSensitive: canViewSensitiveDocs(user),
        })
      : Promise.resolve([] as TodoItem[]),
    user && (scope === "org" || (scope === "me" && hasFullAccess(user)))
      ? getManagerActionItems(db)
      : Promise.resolve([] as TodoItem[]),
  ]);
  const all = [...todos, ...managerItems];

  const docs = all.filter(isDoc).sort((a, b) => a.at - b.at);
  const grouped = groupByUrgency(all.filter((it) => !isDoc(it)));
  const tierTotal =
    grouped.overdue.length + grouped.soon.length + grouped.backlog.length;

  const filter = first(sp.filter) ?? "all";
  const now = Date.now();
  const showOwner = scope === "team" || scope === "org";

  const TABS = [
    { key: "all", label: "All", count: tierTotal },
    { key: "overdue", label: "Overdue", count: grouped.overdue.length },
    { key: "soon", label: "This week", count: grouped.soon.length },
    { key: "backlog", label: "Backlog", count: grouped.backlog.length },
    { key: "docs", label: "Documents", count: docs.length },
  ];
  const tabHref = (key: string) => {
    // Keep the current scope on every tab — otherwise a manager viewing their own
    // (?scope=me) list would drop back to the org default on the next click.
    const qs = new URLSearchParams({ scope });
    if (key !== "all") qs.set("filter", key);
    return `/todos?${qs.toString()}`;
  };

  const scopeLabel =
    scope === "team" ? "My team" : scope === "org" ? "Org-wide" : "My work";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink fallbackHref="/" label="Back to dashboard" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          To-dos
        </h1>
        <span className="text-sm text-slate-500">{scopeLabel}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {TABS.map((t) => {
          const active = filter === t.key;
          return (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
              <span className="tabular-nums opacity-80">{t.count}</span>
            </Link>
          );
        })}
      </div>

      {filter === "docs" ? (
        <FullList items={docs} showOwner={showOwner} now={now} isOverdue={false} />
      ) : filter === "all" ? (
        tierTotal === 0 && docs.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-5">
            {(["overdue", "soon", "backlog"] as TodoUrgency[]).map((k) =>
              grouped[k].length > 0 ? (
                <TierBlock
                  key={k}
                  tier={k}
                  items={grouped[k]}
                  showOwner={showOwner}
                  now={now}
                />
              ) : null,
            )}
            {docs.length > 0 && (
              <div>
                <SectionHead dot="bg-slate-400" label="📄 Documents expiring" count={docs.length} />
                <FullList items={docs} showOwner={showOwner} now={now} isOverdue={false} />
              </div>
            )}
          </div>
        )
      ) : grouped[filter as TodoUrgency]?.length ? (
        <FullList
          items={grouped[filter as TodoUrgency]}
          showOwner={showOwner}
          now={now}
          isOverdue={filter === "overdue"}
        />
      ) : (
        <Empty />
      )}
    </div>
  );
}

function TierBlock({
  tier,
  items,
  showOwner,
  now,
}: {
  tier: TodoUrgency;
  items: TodoItem[];
  showOwner: boolean;
  now: number;
}) {
  const m = TIER_META[tier];
  return (
    <div>
      <SectionHead dot={m.dot} label={m.label} count={items.length} />
      <FullList
        items={items}
        showOwner={showOwner}
        now={now}
        isOverdue={tier === "overdue"}
      />
    </div>
  );
}

function SectionHead({
  dot,
  label,
  count,
}: {
  dot: string;
  label: string;
  count: number;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </h2>
      <span className="text-xs font-semibold text-slate-400">{count}</span>
    </div>
  );
}

function FullList({
  items,
  showOwner,
  now,
  isOverdue,
}: {
  items: TodoItem[];
  showOwner: boolean;
  now: number;
  isOverdue: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">
      {items.map((it, i) => {
        const days = isOverdue ? Math.floor((now - it.at) / DAY) : -1;
        return (
          <li key={i}>
            <Link
              href={it.href}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {it.primary}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {it.secondary}
                </span>
              </span>
              {days >= 1 && (
                <span className="shrink-0 text-xs font-bold text-[#b1471f]">
                  {days}d
                </span>
              )}
              {showOwner && (
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {it.ownerName}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Empty() {
  return (
    <p className="rounded-md border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-slate-400">
      Nothing here — you&apos;re all clear. ✓
    </p>
  );
}
