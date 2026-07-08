/**
 * Generic loading placeholder for list pages — a title bar, a filter bar, and a
 * few table rows. Rendered by each list route's loading.tsx while the server
 * component streams, so navigation shows an instant skeleton instead of a blank
 * pause.
 */
export function ListSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-9 w-32 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-full animate-pulse rounded bg-slate-100"
          />
        ))}
      </div>
    </div>
  );
}
