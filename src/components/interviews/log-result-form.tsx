"use client";

import { useActionState, useEffect, useState } from "react";
import { Textarea } from "@/components/ui/field";
import { NullableField } from "@/components/ui/nullable-field";
import { Button } from "@/components/ui/button";
import { logInterviewResult } from "@/server/actions/interviews";
import { useToast } from "@/components/ui/toast";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { InterviewType } from "@/generated/prisma/enums";

/** H2 focused "Log result" dialog: records a round's outcome + feedback and — via
 *  the server-side coupling — drives the submission status in one step. Trimmed to
 *  the outcome, feedback, and (for reject/hold) a reason; everything else about a
 *  round is edited through the full form. */

type Outcome = {
  value: string;
  label: string;
  consequence: string;
  /** Only offered on a client-stage round — a vendor screening can't select a
   *  candidate outright (that's the client's call), so it never drives Selected. */
  clientOnly?: boolean;
};

const OUTCOMES: Outcome[] = [
  {
    value: "SELECTED",
    label: "Selected — candidate cleared",
    consequence: "Submission moves to Selected.",
    clientOnly: true,
  },
  {
    value: "NEED_ANOTHER_ROUND",
    label: "Passed — needs another round",
    consequence: "Stays in this stage — add the next round after.",
  },
  {
    value: "WAITING",
    label: "Interview happened — awaiting decision",
    consequence: "Saves your read; submission stays put until the verdict.",
  },
  {
    value: "ON_HOLD",
    label: "Put on hold",
    consequence: "Submission moves to On hold.",
  },
  {
    value: "REJECTED",
    label: "Rejected",
    consequence: "Submission moves to Rejected (pipeline closes).",
  },
  {
    value: "NO_SHOW",
    label: "Didn't happen — no-show",
    consequence: "Stays put; reschedule with a new round.",
  },
  {
    value: "CANCELLED",
    label: "Didn't happen — cancelled",
    consequence: "Stays put; reschedule with a new round.",
  },
];

// Outcomes where the interview happened with a verdict/interim read → feedback
// required-or-N/A. Mirrors FEEDBACK_REQUIRED_RESULTS in validation/interview.ts.
const FEEDBACK_REQUIRED = new Set([
  "SELECTED",
  "NEED_ANOTHER_ROUND",
  "REJECTED",
  "ON_HOLD",
]);

const CLIENT_TYPES: InterviewType[] = [
  "CLIENT_INTERVIEW",
  "MANAGER_ROUND",
  "HR_ROUND",
  "FINAL_ROUND",
  "OTHER",
];

export function LogResultForm({
  round,
  onDone,
}: {
  round: {
    id: string;
    roundName: string;
    roundOrder: number;
    interviewType: InterviewType;
    feedback: string | null;
  };
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    logInterviewResult,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) {
      if (state.toast)
        toast({
          tone: "success",
          title: state.toast.title,
          description: state.toast.description,
        });
      onDone();
    }
  }, [state.ok, state.toast, onDone, toast]);

  const errors = state.fieldErrors ?? {};

  // No default outcome — the recruiter must pick (H2: done-mode no longer
  // silently defaults to Completed).
  const [result, setResult] = useState("");
  const [feedback, setFeedback] = useState(round.feedback ?? "");
  const [feedbackNa, setFeedbackNa] = useState(false);
  const [reason, setReason] = useState("");

  const options = OUTCOMES.filter(
    (o) => !o.clientOnly || CLIENT_TYPES.includes(round.interviewType),
  );
  const isReject = result === "REJECTED";
  const isHold = result === "ON_HOLD";
  const showReason = isReject || isHold;
  const showFeedback = FEEDBACK_REQUIRED.has(result) || result === "WAITING";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="roundId" value={round.id} />

      <p className="text-sm text-slate-500">
        Round {round.roundOrder} · {round.roundName}
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">
          Outcome
        </legend>
        <div className="space-y-2">
          {options.map((o) => {
            const sel = result === o.value;
            return (
              <label
                key={o.value}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
                  (sel
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                    : "border-slate-200 hover:border-slate-300")
                }
              >
                <input
                  type="radio"
                  name="result"
                  value={o.value}
                  checked={sel}
                  onChange={() => setResult(o.value)}
                  className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    {o.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {o.consequence}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.result && (
          <p className="mt-1 text-sm text-red-600">{errors.result}</p>
        )}
      </fieldset>

      {showFeedback && (
        <NullableField
          label="Feedback"
          htmlFor="feedback"
          name="feedback"
          // "Awaiting decision" saves an interim read but doesn't require one.
          required={result !== "WAITING"}
          na={feedbackNa}
          onToggleNa={(v) => {
            setFeedbackNa(v);
            if (v) setFeedback("");
          }}
          error={errors.feedback}
          hint={
            result === "WAITING"
              ? "Optional — your read while the decision is pending."
              : undefined
          }
        >
          <Textarea
            id="feedback"
            name="feedback"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={feedbackNa}
            placeholder="How did it go? Strengths, concerns, panel notes…"
          />
        </NullableField>
      )}

      {showReason && (
        <div>
          <label
            htmlFor="reason"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            {isReject ? "Rejection reason" : "Hold reason"}{" "}
            <span className="text-rose-500">*</span>
          </label>
          <Textarea
            id="reason"
            name="reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              isReject
                ? "Why was the candidate rejected? Lands on the timeline."
                : "Why is this on hold?"
            }
          />
          {errors.reason && (
            <p className="mt-1 text-sm text-red-600">{errors.reason}</p>
          )}
        </div>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !result}>
          {pending ? "Saving…" : "Save result"}
        </Button>
      </div>
    </form>
  );
}
