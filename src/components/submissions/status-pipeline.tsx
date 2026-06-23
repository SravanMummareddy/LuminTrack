import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  SUBMISSION_PIPELINE,
  SUBMISSION_STAGE_INDEX,
  SUBMISSION_STATUS_LABEL,
} from "@/lib/labels";
import type { SubmissionStatus } from "@/generated/prisma/enums";

/**
 * Horizontal stepper for the submission pipeline (spec §9.8). Stages up to the
 * current status are marked done; the "Decision" stage (index 4) shows the live
 * Selected / Rejected / On Hold label and is tinted to match.
 */
export function StatusPipeline({ status }: { status: SubmissionStatus }) {
  const currentIndex = SUBMISSION_STAGE_INDEX[status];

  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {SUBMISSION_PIPELINE.map((stageLabel, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const label =
          i === 4 && currentIndex === 4
            ? SUBMISSION_STATUS_LABEL[status]
            : stageLabel;

        let dotClass = "border-slate-300 bg-white text-slate-400";
        if (reached) dotClass = "border-indigo-600 bg-indigo-600 text-white";
        if (isCurrent) {
          if (status === "REJECTED")
            dotClass = "border-red-600 bg-red-600 text-white";
          else if (status === "ON_HOLD")
            dotClass = "border-amber-500 bg-amber-500 text-white";
          else
            dotClass =
              "border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-200";
        }

        return (
          <Fragment key={stageLabel}>
            {i > 0 && (
              <div
                className={cn(
                  "h-0.5 w-6 shrink-0 sm:w-10",
                  i <= currentIndex ? "bg-indigo-600" : "bg-slate-200",
                )}
              />
            )}
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                  dotClass,
                )}
              >
                {reached && !isCurrent ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-xs font-medium",
                  isCurrent
                    ? "text-slate-900"
                    : reached
                      ? "text-slate-600"
                      : "text-slate-400",
                  i === 4 && "cursor-help",
                )}
                title={
                  i === 4
                    ? "Decision: Selected, Rejected, or On Hold"
                    : undefined
                }
              >
                {label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
