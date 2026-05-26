"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

type RecentKind = "job" | "candidate";
type RecentEntry = { id: string; label: string; sub?: string; ts: number };

const KEY = "lumintrack:recent:v1";
const CAP = 5;

type Store = Record<RecentKind, RecentEntry[]>;

function readStore(): Store {
  if (typeof window === "undefined") return { job: [], candidate: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { job: [], candidate: [] };
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      job: Array.isArray(parsed.job) ? parsed.job : [],
      candidate: Array.isArray(parsed.candidate) ? parsed.candidate : [],
    };
  } catch {
    return { job: [], candidate: [] };
  }
}

function writeStore(s: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    // Cross-tab + same-tab listeners — `storage` events don't fire in the
    // tab that wrote, so we dispatch a custom event for the menu component.
    window.dispatchEvent(new Event("lumintrack:recent-changed"));
  } catch {
    /* localStorage disabled / over quota — silently drop the entry */
  }
}

export function RecentlyViewedTracker({
  kind,
  id,
  label,
  sub,
}: {
  kind: RecentKind;
  id: string;
  label: string;
  sub?: string;
}) {
  useEffect(() => {
    const store = readStore();
    const next = [
      { id, label, sub, ts: Date.now() },
      ...store[kind].filter((e) => e.id !== id),
    ].slice(0, CAP);
    writeStore({ ...store, [kind]: next });
  }, [kind, id, label, sub]);
  return null;
}

export function RecentlyViewedMenu() {
  const [open, setOpen] = useState(false);
  // Lazy initializer — `readStore` is SSR-safe (returns empties when window
  // is absent), so the client picks up real values on first render without
  // a setState-in-effect hop.
  const [store, setStore] = useState<Store>(readStore);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function refresh() {
      setStore(readStore());
    }
    window.addEventListener("lumintrack:recent-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("lumintrack:recent-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const empty = store.job.length === 0 && store.candidate.length === 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Recently viewed"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
      >
        <Clock className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg"
        >
          {empty ? (
            <p className="px-2 py-3 text-center text-xs text-slate-500">
              Recently viewed jobs and candidates will appear here.
            </p>
          ) : (
            <>
              <Section
                title="Jobs"
                entries={store.job}
                hrefFor={(id) => `/jobs/${id}`}
                onPick={() => setOpen(false)}
              />
              <Section
                title="Candidates"
                entries={store.candidate}
                hrefFor={(id) => `/candidates/${id}`}
                onPick={() => setOpen(false)}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  entries,
  hrefFor,
  onPick,
}: {
  title: string;
  entries: RecentEntry[];
  hrefFor: (id: string) => string;
  onPick: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="py-1">
      <p className="px-2 pb-1 text-[10px] font-medium tracking-wide text-slate-400 uppercase">
        {title}
      </p>
      <ul>
        {entries.map((e) => (
          <li key={e.id}>
            <Link
              href={hrefFor(e.id)}
              onClick={onPick}
              className="flex flex-col rounded px-2 py-1.5 hover:bg-slate-50"
            >
              <span className="truncate text-slate-800">{e.label}</span>
              {e.sub ? (
                <span className="truncate text-xs text-slate-500">{e.sub}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
