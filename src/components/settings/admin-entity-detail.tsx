import Link from "next/link";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import type { AdminEntityDetail } from "@/server/queries/admin-entities";

/**
 * WS4 — one renderer for every admin-entity detail page (Users / Teams / Roles /
 * Organizations / Glossary). Mirrors the org-entity detail layout: header with
 * name + mono display-ID + status badge + Edit, a summary grid, and related
 * cards. The query normalises each entity into `AdminEntityDetail` so this stays
 * entity-agnostic.
 */
export function AdminEntityDetailView({ detail }: { detail: AdminEntityDetail }) {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink fallbackHref={`/settings?tab=${detail.backTab}`} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            {detail.name}
            {detail.status && (
              <Badge tone={detail.status.tone}>{detail.status.label}</Badge>
            )}
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-500">
            {detail.displayId}
          </p>
        </div>
        <LinkButton href={detail.editHref}>Edit</LinkButton>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {detail.summary.map((s, i) => (
            <div key={i} className={s.wide ? "col-span-2 sm:col-span-3" : ""}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {s.label}
              </dt>
              <dd className="mt-0.5 text-sm text-slate-800">
                {s.href ? (
                  <Link href={s.href} className="text-indigo-600 hover:underline">
                    {s.value}
                  </Link>
                ) : (
                  s.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {detail.cards.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          {detail.cards.map((card, i) => (
            <section
              key={i}
              className="rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-700">
                  {card.title}
                </h2>
                {card.count != null && (
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {card.count}
                  </span>
                )}
              </div>
              {card.items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  {card.emptyText}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {card.items.map((it, j) => (
                    <li
                      key={j}
                      className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm"
                    >
                      {it.href ? (
                        <Link
                          href={it.href}
                          className={`font-medium text-indigo-600 hover:underline ${
                            it.mono ? "font-mono text-xs" : ""
                          }`}
                        >
                          {it.left}
                        </Link>
                      ) : (
                        <span
                          className={`text-slate-800 ${
                            it.mono ? "font-mono text-xs" : ""
                          }`}
                        >
                          {it.left}
                        </span>
                      )}
                      {it.right && (
                        <span className="ml-auto text-xs text-slate-500">
                          {it.right}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
