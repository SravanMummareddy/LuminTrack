"use client";

import { Fragment } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  SUBMISSION_PIPELINE,
  SUBMISSION_PIPELINE_SHORT,
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
    <div className="flex items-start overflow-x-auto pb-1">
      {SUBMISSION_PIPELINE.map((stageLabel, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        const isNext = interactive && i === nextStageIndex;
        // Full label drives the tooltip + the Decision-branch live status; the
        // stepper renders the compact label so all 8 stages fit one row.
        const fullLabel =
          i === 4 && currentIndex === 4
            ? SUBMISSION_STATUS_LABEL[status]
            : stageLabel;
        const label =
          i === 4 && currentIndex === 4
            ? SUBMISSION_STATUS_LABEL[status]
            : SUBMISSION_PIPELINE_SHORT[i];

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
                "text-center text-[11px] font-medium leading-tight",
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
                  // flex-1 so the 8 stages spread edge-to-edge and fit one row;
                  // mt aligns the line to the dot's vertical center (dot = h-7).
                  "mt-3.5 h-0.5 min-w-[10px] flex-1",
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
                    ? fullLabel
                    : isNext
                      ? `Advance to ${fullLabel.toLowerCase()}`
                      : reached
                        ? `Move back to ${fullLabel.toLowerCase()}`
                        : `Skip ahead to ${fullLabel.toLowerCase()}`
                }
                className="group flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {stageBody}
              </button>
            ) : (
              <div
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                title={
                  i === 4
                    ? "Decision: Selected, Rejected, or On Hold"
                    : fullLabel
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
