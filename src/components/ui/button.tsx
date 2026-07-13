import Link from "next/link";
import { cn } from "@/lib/cn";

export type Variant = "primary" | "secondary" | "danger" | "ghost";
export type Size = "md" | "sm";

const variantClass: Record<Variant, string> = {
  primary: "border-transparent bg-indigo-600 text-white hover:bg-indigo-700",
  secondary: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "border-red-300 bg-white text-red-700 hover:bg-red-50",
  ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
};

const sizeClass: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
};

/** Shared button/link styling so anchors and buttons match. */
export function buttonClass(variant: Variant = "primary", size: Size = "md"): string {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60",
    // Visible keyboard focus — every Button / LinkButton / anchor that uses
    // buttonClass() gets the indigo ring. Hover styles remain per-variant.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2",
    variantClass[variant],
    sizeClass[size],
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}
