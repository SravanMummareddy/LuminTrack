"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * A "Back" control that returns to wherever the user actually came from
 * (e.g. Interviews → a candidate → back to *Interviews*, not the Candidates
 * list). Falls back to `fallbackHref` — the entity's own section list — on a
 * direct load (new tab / bookmark) where there's no in-app history to pop.
 */
export function BackLink({
  fallbackHref,
  label = "Back",
}: {
  fallbackHref: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
