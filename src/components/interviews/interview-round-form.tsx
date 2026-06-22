"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  createInterviewRound,
  updateInterviewRound,
} from "@/server/actions/interviews";
import {
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABEL,
  INTERVIEW_RESULTS,
  INTERVIEW_RESULT_LABEL,
  INTERVIEW_MODES,
  INTERVIEW_MODE_LABEL,
  INTERVIEW_PLATFORMS,
  INTERVIEW_PLATFORM_LABEL,
} from "@/lib/labels";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { InterviewType, InterviewResult } from "@/generated/prisma/enums";

export type InterviewRoundData = {
  id: string;
  roundOrder: number;
  roundName: string;
  interviewType: InterviewType;
  interviewerName: string | null;
  interviewMode: string | null;
  interviewPlatform: string | null;
  meetingLink: string | null;
  scheduledAt: Date | string | null;
  scheduledTimezone: string | null;
  supportNeeded: boolean;
  result: InterviewResult;
  feedback: string | null;
  notes: string | null;
  updatedAt: Date | string;
  updatedBy: { fullName: string } | null;
};

/** Converts a stored date into a `datetime-local` input value in the browser's timezone. */
function toDateTimeLocal(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function InterviewRoundForm({
  submissionId,
  round,
  onDone,
}: {
  submissionId: string;
  round?: InterviewRoundData;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    round ? updateInterviewRound : createInterviewRound,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const errors = state.fieldErrors ?? {};
  // The video platform field only shows when the mode is a video call.
  const [mode, setMode] = useState(round?.interviewMode ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      {round && <input type="hidden" name="id" value={round.id} />}

      <Field
        label="Round name"
        htmlFor="roundName"
        required
        error={errors.roundName}
      >
        <Input
          id="roundName"
          name="roundName"
          defaultValue={round?.roundName ?? ""}
          placeholder="e.g. Technical Round 1"
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Interview type"
          htmlFor="interviewType"
          required
          error={errors.interviewType}
        >
          <Select
            id="interviewType"
            name="interviewType"
            defaultValue={round?.interviewType ?? ""}
            required
          >
            <option value="" disabled>
              Select a type…
            </option>
            {INTERVIEW_TYPES.map((t) => (
              <option key={t} value={t}>
                {INTERVIEW_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Result" htmlFor="result" required error={errors.result}>
          <Select
            id="result"
            name="result"
            defaultValue={round?.result ?? "WAITING"}
          >
            {INTERVIEW_RESULTS.map((r) => (
              <option key={r} value={r}>
                {INTERVIEW_RESULT_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Interview mode"
          htmlFor="interviewMode"
          error={errors.interviewMode}
        >
          <Select
            id="interviewMode"
            name="interviewMode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">Not specified</option>
            {INTERVIEW_MODES.map((m) => (
              <option key={m} value={m}>
                {INTERVIEW_MODE_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>

        {mode === "VIDEO" && (
          <Field
            label="Video platform"
            htmlFor="interviewPlatform"
            error={errors.interviewPlatform}
          >
            <Select
              id="interviewPlatform"
              name="interviewPlatform"
              defaultValue={round?.interviewPlatform ?? ""}
            >
              <option value="">Not specified</option>
              {INTERVIEW_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {INTERVIEW_PLATFORM_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Interviewer name"
          htmlFor="interviewerName"
          error={errors.interviewerName}
        >
          <Input
            id="interviewerName"
            name="interviewerName"
            defaultValue={round?.interviewerName ?? ""}
          />
        </Field>

        <Field
          label="Meeting link"
          htmlFor="meetingLink"
          error={errors.meetingLink}
        >
          <Input
            id="meetingLink"
            name="meetingLink"
            type="url"
            inputMode="url"
            placeholder="https://…"
            defaultValue={round?.meetingLink ?? ""}
          />
        </Field>

        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="supportNeeded"
            defaultChecked={round?.supportNeeded ?? false}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Support needed (a team member shadows this interview)
        </label>

        <Field
          label="Interview date & time"
          htmlFor="scheduledAt"
          error={errors.scheduledAt}
        >
          <Input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            defaultValue={toDateTimeLocal(round?.scheduledAt ?? null)}
          />
        </Field>

        <Field
          label="Time zone"
          htmlFor="scheduledTimezone"
          hint="IANA name — e.g. America/New_York, Asia/Kolkata, Europe/London."
          error={errors.scheduledTimezone}
        >
          <Input
            id="scheduledTimezone"
            name="scheduledTimezone"
            placeholder={
              typeof Intl !== "undefined"
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : "America/New_York"
            }
            defaultValue={round?.scheduledTimezone ?? ""}
          />
        </Field>
      </div>

      <Field label="Feedback" htmlFor="feedback" error={errors.feedback}>
        <Textarea
          id="feedback"
          name="feedback"
          rows={3}
          defaultValue={round?.feedback ?? ""}
        />
      </Field>

      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={round?.notes ?? ""}
        />
      </Field>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : round ? "Save changes" : "Add round"}
        </Button>
      </div>
    </form>
  );
}
