import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BadgeTone } from "@/lib/labels";

const iconToneClass: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-600",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  indigo: "bg-indigo-100 text-indigo-700",
};

type StatCardProps = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: BadgeTone;
  hint?: string;
  href?: string;
};

/** A single headline metric tile for the Dashboard and Recruiter detail pages. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
  hint,
  href,
}: StatCardProps) {
  const body = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4",
        href && "transition hover:border-indigo-300 hover:shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          iconToneClass[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums text-slate-900">
          {value}
        </div>
        <div className="truncate text-xs font-medium text-slate-500">{label}</div>
        {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
