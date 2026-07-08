"use client";

import { Check, Circle } from "lucide-react";
import { passwordRequirements } from "@/lib/password-policy";
import { cn } from "@/lib/cn";

/**
 * Live password-policy checklist. Renders each requirement with a tick once the
 * current value meets it, so the user sees exactly what's still needed as they
 * type. Purely presentational — the same policy is enforced server-side by the
 * Zod schema, so hiding this never lets a weak password through.
 *
 * Pass `value=""` (the default before typing) and the list shows as a neutral
 * "to-do"; hide the whole block until the field has focus/content if you'd
 * rather not show it up front.
 */
export function PasswordRequirements({ value }: { value: string }) {
  const reqs = passwordRequirements(value);
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {reqs.map((r) => (
        <li
          key={r.label}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            r.met ? "text-green-700" : "text-slate-500",
          )}
        >
          {r.met ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          )}
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}
