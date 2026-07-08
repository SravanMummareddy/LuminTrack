"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, ChevronDown, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSavedViews } from "@/lib/use-saved-views";

/**
 * "Views" control for a list page: save the current filter + sort combination
 * under a name and re-apply it in one click. A view is the current URL query
 * (minus `page`); applying it navigates to `basePath?query`. Per-browser via
 * localStorage — see useSavedViews.
 */
export function SavedViews({
  storageKey,
  basePath,
}: {
  storageKey: string;
  basePath: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { views, hydrated, saveView, deleteView } = useSavedViews(storageKey);

  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setNaming(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // The query a view captures / matches against: everything except the page
  // cursor, normalised through URLSearchParams so key order is stable.
  function currentQuery(): string {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    return next.toString();
  }

  const current = currentQuery();
  const activeView = views.find((v) => v.query === current);
  const hasFilters = current.length > 0;

  function applyView(query: string) {
    router.push(query ? `${basePath}?${query}` : basePath);
    setOpen(false);
  }

  function commitSave() {
    const n = name.trim();
    if (!n) return;
    saveView(n, current);
    setName("");
    setNaming(false);
  }

  // Nothing persisted yet and no filters to save → don't clutter the bar.
  if (hydrated && views.length === 0 && !hasFilters) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition whitespace-nowrap",
          activeView
            ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
        )}
      >
        <Bookmark className="h-3.5 w-3.5" />
        {activeView ? activeView.name : "Views"}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 min-w-56 rounded-lg border border-slate-200 bg-white p-1.5 text-sm shadow-lg">
          {views.length === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-slate-400">
              No saved views yet.
            </p>
          ) : (
            <div className="max-h-64 overflow-auto">
              {views.map((v) => {
                const sel = v.query === current;
                return (
                  <div
                    key={v.name}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2.5 py-1.5",
                      sel ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => applyView(v.query)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {sel ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{v.name}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete view ${v.name}`}
                      onClick={() => deleteView(v.name)}
                      className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-1 border-t border-slate-100 pt-1">
            {naming ? (
              <div className="flex items-center gap-1 px-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="View name…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitSave();
                    } else if (e.key === "Escape") setNaming(false);
                  }}
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={commitSave}
                  disabled={!name.trim()}
                  className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setName(activeView?.name ?? "");
                  setNaming(true);
                }}
                disabled={!hasFilters}
                title={
                  hasFilters
                    ? undefined
                    : "Apply a filter or sort first, then save it as a view."
                }
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                <Plus className="h-3.5 w-3.5" />
                Save current view
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
