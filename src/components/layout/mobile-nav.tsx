"use client";

import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks } from "@/components/layout/nav-links";
import { useFocusTrap } from "@/lib/use-focus-trap";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  // Focus trap + Escape + body-scroll lock + focus return-to-burger come
  // from the shared hook, which also powers the Dialog component.
  useFocusTrap(open, panelRef, () => setOpen(false));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 md:hidden"
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl outline-none transition-transform md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
              L
            </div>
            <span className="font-semibold text-slate-900">LuminTrack</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      </aside>
    </>
  );
}
