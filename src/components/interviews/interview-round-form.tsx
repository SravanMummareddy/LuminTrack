"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { FormSection } from "@/components/ui/form-section";
import { NullableField } from "@/components/ui/nullable-field";
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
  supportProviderId: string | null;
  supportMethod: string | null;
  supportProvider: { name: string } | null;
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
  supportProviders,
  onDone,
}: {
  submissionId: string;
  round?: InterviewRoundData;
  supportProviders: { id: string; name: string; skills: string[] }[];
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

  // Inputs are controlled so the N/A toggle can clear + disable them. On EDIT a
  // field that was left blank opens pre-marked N/A (the value was a conscious
  // gap, and forcing the editor to re-touch every empty field is friction); on a
  // NEW round nothing is pre-marked, so each field must get a value or an N/A.
  const isEdit = round != null;
  const naInit = (v: string | null | undefined) => isEdit && !v;
  const [fields, setFields] = useState({
    roundName: round?.roundName ?? "",
    interviewType: (round?.interviewType as string) ?? "",
    result: (round?.result as string) ?? "WAITING",
    interviewerName: round?.interviewerName ?? "",
    interviewerNameNa: naInit(round?.interviewerName),
    interviewMode: round?.interviewMode ?? "",
    interviewModeNa: naInit(round?.interviewMode),
    interviewPlatform: round?.interviewPlatform ?? "",
    interviewPlatformNa: naInit(round?.interviewPlatform),
    meetingLink: round?.meetingLink ?? "",
    meetingLinkNa: naInit(round?.meetingLink),
    scheduledAt: toDateTimeLocal(round?.scheduledAt ?? null),
    scheduledAtNa: naInit(
      round?.scheduledAt == null ? "" : String(round.scheduledAt),
    ),
    scheduledTimezone: round?.scheduledTimezone ?? "",
    scheduledTimezoneNa: naInit(round?.scheduledTimezone),
    supportProviderId: round?.supportProviderId ?? "",
    supportProviderIdNa: naInit(round?.supportProviderId),
    supportMethod: round?.supportMethod ?? "",
    supportMethodNa: naInit(round?.supportMethod),
    feedback: round?.feedback ?? "",
    feedbackNa: naInit(round?.feedback),
    notes: round?.notes ?? "",
  });
  // "Done with support" reveals the provider + method fields.
  const [withSupport, setWithSupport] = useState(round?.supportNeeded ?? false);

  type Fields = typeof fields;
  const set =
    (name: keyof Fields) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setFields((f) => ({ ...f, [name]: e.target.value }));
  // Toggling N/A on clears the paired value; off leaves it for re-entry.
  const naToggle =
    (field: keyof Fields, naField: keyof Fields) => (v: boolean) =>
      setFields((f) => ({ ...f, [naField]: v, ...(v ? { [field]: "" } : {}) }));

  const isVideo = fields.interviewMode === "VIDEO";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="submissionId" value={submissionId} />
      {round && <input type="hidden" name="id" value={round.id} />}

      <FormSection n={1} title="Round & outcome">
        <Field label="Round name" htmlFor="roundName" required error={errors.roundName}>
          <Input
            id="roundName"
            name="roundName"
            value={fields.roundName}
            onChange={set("roundName")}
            placeholder="e.g. Technical Round 1"
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Interview type" htmlFor="interviewType" required error={errors.interviewType}>
            <Select id="interviewType" name="interviewType" value={fields.interviewType} onChange={set("interviewType")} required>
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
            <Select id="result" name="result" value={fields.result} onChange={set("result")}>
              {INTERVIEW_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {INTERVIEW_RESULT_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection n={2} title="Schedule & support">
        {/* Wave 4 (strict): mode, interviewer and date/time mean "an interview
            is really set up" — hard-required, no N/A escape, so an empty round
            can't slip past the pipeline's advance gate. Video adds platform +
            link. Time zone / feedback / support stay required-or-N/A. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Interview mode" htmlFor="interviewMode" required error={errors.interviewMode}>
            <Select id="interviewMode" name="interviewMode" value={fields.interviewMode} onChange={set("interviewMode")} required>
              <option value="" disabled>
                Select a mode…
              </option>
              {INTERVIEW_MODES.map((m) => (
                <option key={m} value={m}>
                  {INTERVIEW_MODE_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Interviewer name" htmlFor="interviewerName" required error={errors.interviewerName}>
            <Input id="interviewerName" name="interviewerName" value={fields.interviewerName} onChange={set("interviewerName")} placeholder="Who is interviewing" required />
          </Field>

          <Field label="Interview date & time" htmlFor="scheduledAt" required error={errors.scheduledAt}>
            {/* The visible input is timezone-naive and shows the browser's local
                wall-clock. Post an unambiguous ISO instant instead of the naive
                string (the nameless input above doesn't submit) — the browser
                parses the local value to the correct UTC instant, so it stores +
                round-trips without the +offset drift a naive string re-parsed as
                UTC on the server would cause (which also logged phantom reschedules). */}
            <Input id="scheduledAt" type="datetime-local" value={fields.scheduledAt} onChange={set("scheduledAt")} required />
            <input
              type="hidden"
              name="scheduledAt"
              value={fields.scheduledAt ? new Date(fields.scheduledAt).toISOString() : ""}
            />
          </Field>

          <NullableField label="Time zone" htmlFor="scheduledTimezone" name="scheduledTimezone" na={fields.scheduledTimezoneNa} onToggleNa={naToggle("scheduledTimezone", "scheduledTimezoneNa")} error={errors.scheduledTimezone} hint="IANA name — e.g. America/New_York, Asia/Kolkata.">
            <Input
              id="scheduledTimezone"
              name="scheduledTimezone"
              placeholder={
                typeof Intl !== "undefined"
                  ? Intl.DateTimeFormat().resolvedOptions().timeZone
                  : "America/New_York"
              }
              value={fields.scheduledTimezone}
              onChange={set("scheduledTimezone")}
              disabled={fields.scheduledTimezoneNa}
            />
          </NullableField>

          {isVideo && (
            <Field label="Video platform" htmlFor="interviewPlatform" required error={errors.interviewPlatform}>
              <Select id="interviewPlatform" name="interviewPlatform" value={fields.interviewPlatform} onChange={set("interviewPlatform")} required>
                <option value="" disabled>
                  Select a platform…
                </option>
                {INTERVIEW_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {INTERVIEW_PLATFORM_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {isVideo && (
            <Field label="Meeting link" htmlFor="meetingLink" required error={errors.meetingLink}>
              <Input id="meetingLink" name="meetingLink" type="url" inputMode="url" placeholder="https://…" value={fields.meetingLink} onChange={set("meetingLink")} required />
            </Field>
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="supportNeeded"
              checked={withSupport}
              onChange={(e) => setWithSupport(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Done with support (an external person assisted this interview)
          </label>
          {withSupport && (
            <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
              <NullableField label="Support provider" htmlFor="supportProviderId" name="supportProviderId" na={fields.supportProviderIdNa} onToggleNa={naToggle("supportProviderId", "supportProviderIdNa")} error={errors.supportProviderId} hint="Manage the list in Settings → Support.">
                <Select id="supportProviderId" name="supportProviderId" value={fields.supportProviderId} onChange={set("supportProviderId")} disabled={fields.supportProviderIdNa}>
                  <option value="">— Select —</option>
                  {supportProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.skills.length ? ` · ${p.skills.slice(0, 3).join(", ")}` : ""}
                    </option>
                  ))}
                </Select>
              </NullableField>
              <NullableField label="Support method" htmlFor="supportMethod" name="supportMethod" na={fields.supportMethodNa} onToggleNa={naToggle("supportMethod", "supportMethodNa")} error={errors.supportMethod} hint="How support was given (free text).">
                <Input id="supportMethod" name="supportMethod" placeholder="e.g. live audio support" value={fields.supportMethod} onChange={set("supportMethod")} disabled={fields.supportMethodNa} />
              </NullableField>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection n={3} title="Feedback & notes">
        <NullableField label="Feedback" htmlFor="feedback" name="feedback" na={fields.feedbackNa} onToggleNa={naToggle("feedback", "feedbackNa")} error={errors.feedback}>
          <Textarea id="feedback" name="feedback" rows={3} value={fields.feedback} onChange={set("feedback")} disabled={fields.feedbackNa} />
        </NullableField>

        <Field label="Notes" htmlFor="notes" error={errors.notes} hint="Optional.">
          <Textarea id="notes" name="notes" rows={2} value={fields.notes} onChange={set("notes")} />
        </Field>
      </FormSection>

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
