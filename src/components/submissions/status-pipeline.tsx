"use client";

import { Fragment } from "react";
import { ArrowRight, Check } from "lucide-react";
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
 *
 * When `onStageClick` is passed the stepper becomes the primary control: each
 * dot is a button, the immediate next stage (`nextStageIndex`) gets a dashed
 * "click to advance" cue, and clicking any dot drives the same submit path as
 * the action bar below it. Without it, the stepper is pure display.
 */
export function StatusPipeline({
  status,
  onStageClick,
  nextStageIndex = null,
}: {
  status: SubmissionStatus;
  onStageClick?: (index: number) => void;
  nextStageIndex?: number | null;
}) {
  const currentIndex = SUBMISSION_STAGE_INDEX[status];
  const interactive = typeof onStageClick === "function";

  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {SUBMISSION_PIPELINE.map((stageLabel, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const isNext = interactive && i === nextStageIndex;
        const label =
          i === 4 && currentIndex === 4
            ? SUBMISSION_STATUS_LABEL[status]
            : stageLabel;

        let dotClass = "border-slate-300 bg-white text-slate-400";
        if (reached) dotClass = "border-indigo-600 bg-indigo-600 text-white";
        if (isNext)
          dotClass =
            "border-indigo-500 border-dashed bg-white text-indigo-600";
        if (isCurrent) {
          if (status === "REJECTED")
            dotClass = "border-red-600 bg-red-600 text-white";
          else if (status === "ON_HOLD")
            dotClass = "border-amber-500 bg-amber-500 text-white";
          else
            dotClass =
              "border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-200";
        }

        const dot = (
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
              dotClass,
              interactive && "transition group-hover:scale-110",
            )}
          >
            {reached && !isCurrent ? (
              <Check className="h-3.5 w-3.5" />
            ) : isNext ? (
              <ArrowRight className="h-3.5 w-3.5" />
            ) : (
              i + 1
            )}
          </div>
        );

        const stageBody = (
          <>
            {dot}
            <span
              className={cn(
                "whitespace-nowrap text-xs font-medium",
                isCurrent
                  ? "text-slate-900"
                  : isNext
                    ? "text-indigo-600"
                    : reached
                      ? "text-slate-600"
                      : "text-slate-400",
              )}
            >
              {label}
            </span>
          </>
        );

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
            {interactive ? (
              <button
                type="button"
                onClick={() => onStageClick(i)}
                title={
                  isCurrent
                    ? label
                    : isNext
                      ? `Advance to ${label.toLowerCase()}`
                      : reached
                        ? `Move back to ${label.toLowerCase()}`
                        : `Skip ahead to ${label.toLowerCase()}`
                }
                className="group flex shrink-0 flex-col items-center gap-1.5 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {stageBody}
              </button>
            ) : (
              <div
                className="flex shrink-0 flex-col items-center gap-1.5"
                title={
                  i === 4
                    ? "Decision: Selected, Rejected, or On Hold"
                    : undefined
                }
              >
                {stageBody}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
