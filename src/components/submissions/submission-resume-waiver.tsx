"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LinkButton } from "@/components/ui/button";
import {
  waiveSubmissionResume,
  unwaiveSubmissionResume,
} from "@/server/actions/submissions";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

/**
 * The "submitted without a résumé" flag on the submission detail page.
 * - missing + not waived → amber "No résumé attached" card with Attach / Mark
 *   not required (waive gated to the submitter or an admin).
 * - waived → a quiet "résumé not required" note with who/when + Undo.
 * Rendered only when the submission has no résumé (the parent decides).
 */
export function SubmissionResumeWaiver({
  submissionId,
  waived,
  waivedByName,
  waivedAt,
  editHref,
  canWaive,
}: {
  submissionId: string;
  waived: boolean;
  waivedByName: string | null;
  waivedAt: string | null;
  editHref: string;
  canWaive: boolean;
}) {
  const { toast } = useToast();

  const useToastEffect = (state: FormState) => {
    useEffect(() => {
      if (state.ok && state.toast) toast({ title: state.toast.title });
      else if (state.error) toast({ tone: "error", title: state.error });
    }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  };

  const [waiveState, waiveAction] = useActionState(
    waiveSubmissionResume,
    EMPTY_FORM_STATE,
  );
  const [unwaiveState, unwaiveAction] = useActionState(
    unwaiveSubmissionResume,
    EMPTY_FORM_STATE,
  );
  useToastEffect(waiveState);
  useToastEffect(unwaiveState);

  const waiveFormRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (waived) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-slate-700">✓ Résumé not required</span>
          {waivedByName && (
            <span className="text-slate-500">
              {" "}
              — waived by {waivedByName}
              {waivedAt ? ` · ${waivedAt}` : ""}
            </span>
          )}
        </div>
        {canWaive && (
          <form action={unwaiveAction}>
            <input type="hidden" name="id" value={submissionId} />
            <button
              type="submit"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Undo
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-800">⚠ No résumé attached</p>
      <p className="mt-0.5 text-sm text-amber-700">
        This submission went out without a résumé. Attach one, or mark it not
        required.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <LinkButton href={editHref} size="sm">
          Attach résumé
        </LinkButton>
        {canWaive && (
          <>
            <form ref={waiveFormRef} action={waiveAction}>
              <input type="hidden" name="id" value={submissionId} />
            </form>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Mark not required
            </button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          waiveFormRef.current?.requestSubmit();
        }}
        title="Mark résumé not required?"
        description="This submission will drop off the missing-résumé worklist. You can undo it later."
        confirmLabel="Mark not required"
        tone="primary"
      />
    </div>
  );
}
