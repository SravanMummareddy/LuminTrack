"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/use-focus-trap";

export function Dialog({
  open,
  onClose,
  title,
  description,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Portal to <body> so the fixed-position modal lives outside whatever subtree
  // opened it (e.g. a <form> mid-transition) — that subtree re-rendering can
  // otherwise double-paint an inline fixed overlay, leaving a duplicate/ghost
  // dialog until the next reload. `mounted` guards SSR (no document on first render).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useFocusTrap(open, panelRef, onClose);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative z-10 mt-4 w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
