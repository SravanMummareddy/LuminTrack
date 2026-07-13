"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type Variant } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * A `<form action=…>` submit button that disables itself and swaps to a
 * pending label while the action is in flight — prevents the double-submit /
 * no-feedback gap on plain server-action forms. Must be rendered inside the
 * `<form>` it submits (useFormStatus reads the nearest form context).
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(buttonClass(variant), className)}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
