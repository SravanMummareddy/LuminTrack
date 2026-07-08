import Link from "next/link";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The three-tier flow, visualised on the job detail page: Job → Vendor
 * Requirement → Submission. Each node shows whether that step has happened and
 * how many, and the earliest incomplete step drives a single next-step CTA:
 *   • no VPR yet    → "Create requirement (VPR)" (managers / team leads only)
 *   • VPR, no subs  → "Submit a candidate"
 *   • both done     → no CTA (the sections below let you add more)
 * Pure presentational (server component) — reuses counts already on the page.
 */
export function JobPipelineSteps({
  jobId,
  vprCount,
  submissionCount,
  canManageReq,
  submitHref = "#requirements",
}: {
  jobId: string;
  vprCount: number;
  submissionCount: number;
  canManageReq: boolean;
  /** Where "Submit a candidate" goes — a requirement's convert page (VPR-first),
   *  computed by the job page from its open requirements. */
  submitHref?: string;
}) {
  const steps = [
    { label: "Job", done: true, detail: "Requisition created" },
    {
      label: "Vendor requirement",
      done: vprCount > 0,
      detail:
        vprCount > 0
          ? `${vprCount} requirement${vprCount > 1 ? "s" : ""}`
          : "Not planned yet",
    },
    {
      label: "Submission",
      done: submissionCount > 0,
      detail:
        submissionCount > 0
          ? `${submissionCount} submission${submissionCount > 1 ? "s" : ""}`
          : "No candidates yet",
    },
  ];
  const nextIndex = steps.findIndex((s) => !s.done);

  let cta: { label: string; href: string } | null = null;
  if (vprCount === 0) {
    if (canManageReq)
      cta = {
        label: "Create requirement (VPR)",
        href: `/vendor-portal/new?jobId=${jobId}`,
      };
  } else if (submissionCount === 0) {
    cta = { label: "Submit a candidate", href: submitHref };
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {steps.map((s, i) => {
            const isNext = i === nextIndex;
            return (
              <li key={s.label} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="h-px w-6 bg-slate-200 sm:w-8" aria-hidden />
                )}
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    s.done
                      ? "bg-emerald-100 text-emerald-700"
                      : isNext
                        ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300"
                        : "bg-slate-100 text-slate-400",
                  )}
                >
                  {s.done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-medium text-slate-800">{s.label}</p>
                  <p className="text-xs text-slate-500">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {cta && (
          <Link href={cta.href} className={buttonClass("primary", "sm")}>
            {cta.label}
          </Link>
        )}
      </div>
      {vprCount === 0 && !canManageReq && (
        <p className="mt-3 text-xs text-slate-500">
          A manager or team lead scopes a vendor requirement (rates, engagement)
          before candidates are submitted.
        </p>
      )}
    </section>
  );
}
