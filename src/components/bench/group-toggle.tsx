"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

const KEY = "lumintrack.bench.groupByPriority";

/**
 * "Group by priority" toggle for the bench roster. The server reads `?group`
 * (absent or "1" = grouped, "0" = flat) to decide whether it returns two
 * priority groups or one flat list, so the toggle drives that param. The choice
 * is also mirrored to localStorage: on a fresh visit with no param, a persisted
 * "off" is re-applied once on mount. Default is ON (grouped).
 */
export function GroupToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlVal = params.get("group");
  const on = urlVal === null ? true : urlVal !== "0";

  // Re-apply a persisted "off" when the URL doesn't say — once, on mount.
  useEffect(() => {
    if (urlVal !== null) return;
    try {
      if (localStorage.getItem(KEY) === "0") {
        const next = new URLSearchParams(params.toString());
        next.set("group", "0");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }
    } catch {
      // no localStorage — stay on the default (grouped)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const nextOn = !on;
    try {
      localStorage.setItem(KEY, nextOn ? "1" : "0");
    } catch {
      // ignore — the URL param still carries the choice for this session
    }
    const next = new URLSearchParams(params.toString());
    if (nextOn) next.delete("group");
    else next.set("group", "0");
    // Switching modes changes the pagination shape — reset any page cursors.
    next.delete("ph");
    next.delete("ps");
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
        on
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-indigo-500" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "block h-2.5 w-2.5 rounded-full bg-white transition-transform",
            on && "translate-x-2.5",
          )}
        />
      </span>
      Group by priority
    </button>
  );
}
