"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "lumintrack.settings.adminTools";

/**
 * Collapsed-by-default disclosure for the Settings "Admin tools" card. The
 * summary enumerates the contents so the audit log / export stay discoverable
 * without expanding, and the open/closed choice is remembered (localStorage).
 */
export function AdminToolsDisclosure({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore remembered state post-hydration
    setOpen(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-5 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="text-sm">
          <span className="font-semibold text-slate-700">Admin tools</span>
          <span className="text-slate-400">
            {" "}
            — Audit log · Export data
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4">{children}</div>
      )}
    </section>
  );
}
