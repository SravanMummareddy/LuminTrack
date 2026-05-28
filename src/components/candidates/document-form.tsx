"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  createCandidateDocument,
  updateCandidateDocument,
} from "@/server/actions/candidate-documents";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { isLikelyDriveUrl, DRIVE_LINK_WARNING } from "@/lib/validation/resume";
import type { DocumentCategory } from "@/generated/prisma/enums";

export type DocumentData = {
  id: string;
  category: DocumentCategory;
  label: string;
  driveLink: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
};

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string; sensitive: boolean }[] = [
  { value: "IDENTITY", label: "Identity (passport, driver's license, SSN/visa)", sensitive: true },
  { value: "WORK_AUTH", label: "Work authorization (visa, EAD, I-9, work permit)", sensitive: true },
  { value: "EDUCATION", label: "Education (degrees, transcripts, certifications)", sensitive: false },
  { value: "EMPLOYMENT", label: "Employment (offers, paystubs, W-2, references)", sensitive: false },
  { value: "OTHER", label: "Other (anything else HR may need)", sensitive: false },
];

function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function DocumentForm({
  candidateId,
  doc,
  defaultCategory,
  canManageSensitive,
  onDone,
}: {
  candidateId: string;
  doc?: DocumentData;
  defaultCategory?: DocumentCategory;
  canManageSensitive: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    doc ? updateCandidateDocument : createCandidateDocument,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const errors = state.fieldErrors ?? {};
  const [driveLink, setDriveLink] = useState(doc?.driveLink ?? "");
  const showDriveWarning = !isLikelyDriveUrl(driveLink);

  const visibleOptions = CATEGORY_OPTIONS.filter(
    (o) => canManageSensitive || !o.sensitive,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="candidateId" value={candidateId} />
      {doc && <input type="hidden" name="id" value={doc.id} />}

      <Field label="Category" htmlFor="category" required error={errors.category}>
        <Select
          id="category"
          name="category"
          defaultValue={doc?.category ?? defaultCategory ?? visibleOptions[0]?.value}
          required
        >
          {visibleOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Label" htmlFor="label" required error={errors.label}>
        <Input
          id="label"
          name="label"
          defaultValue={doc?.label ?? ""}
          placeholder="e.g. Passport (US, expires 2031)"
          required
        />
      </Field>

      <Field
        label="Google Drive link"
        htmlFor="driveLink"
        required
        hint="Paste a shared Drive link; only viewers with Drive access can open it."
        error={errors.driveLink}
      >
        <Input
          id="driveLink"
          name="driveLink"
          type="url"
          value={driveLink}
          onChange={(e) => setDriveLink(e.target.value)}
          placeholder="https://drive.google.com/file/d/…"
          required
        />
        {showDriveWarning && (
          <p className="mt-1 text-xs text-amber-700">{DRIVE_LINK_WARNING}</p>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Issued on" htmlFor="issuedAt" error={errors.issuedAt}>
          <Input
            id="issuedAt"
            name="issuedAt"
            type="date"
            defaultValue={toDateInput(doc?.issuedAt)}
          />
        </Field>
        <Field
          label="Expires on"
          htmlFor="expiresAt"
          hint="Leave blank for documents that don't expire (transcripts, offer letters, etc.). When set, the dashboard warns 30 days out."
          error={errors.expiresAt}
        >
          <Input
            id="expiresAt"
            name="expiresAt"
            type="date"
            defaultValue={toDateInput(doc?.expiresAt)}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={doc?.notes ?? ""}
          rows={2}
          placeholder="Optional context (issuing authority, version, etc.)"
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
          {pending ? "Saving…" : doc ? "Save changes" : "Add document"}
        </Button>
      </div>
    </form>
  );
}
