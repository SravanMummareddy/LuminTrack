"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { controlClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { SEARCH_TYPE_LABEL, type SearchResult } from "@/lib/search-types";

/**
 * Topbar global search (spec §10). Debounced typeahead against `/api/search`
 * across candidates, jobs, clients, vendors, sources, and recruiters.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Results are tagged with the query they belong to, so a stale response
  // never renders under a newer query and `loading` can stay fully derived.
  const [data, setData] = useState<{ q: string; items: SearchResult[] }>({
    q: "",
    items: [],
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
        );
        const json = await res.json();
        if (!cancelled) {
          setData({ q: trimmed, items: res.ok ? (json.results ?? []) : [] });
        }
      } catch {
        if (!cancelled) setData({ q: trimmed, items: [] });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const ready = data.q === trimmed;
  const results = ready ? data.items : [];
  const showDropdown = open && trimmed.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search candidates, jobs, clients…"
        className={cn(controlClass, "py-1.5 pl-9")}
        aria-label="Global search"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {!ready ? (
            <p className="px-3 py-3 text-sm text-slate-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">
              No matches for “{trimmed}”.
            </p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.href}-${i}`}
                type="button"
                onClick={() => goTo(r.href)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-800">
                    {r.label}
                  </span>
                  {r.sublabel && (
                    <span className="block truncate text-xs text-slate-400">
                      {r.sublabel}
                    </span>
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {SEARCH_TYPE_LABEL[r.type]}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
