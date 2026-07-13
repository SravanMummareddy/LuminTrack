"use client";

import { useActionState, useState } from "react";
import { RotateCcw, Download, Trash2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/field";
import {
  restoreCandidateFromTrash,
  eraseCandidateNow,
} from "@/server/actions/candidates";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { formatDate } from "@/lib/format";

export function CandidateTrashBanner({
  candidateId,
  candidateName,
  deletedAt,
  retentionDays,
  canManage,
}: {
  candidateId: string;
  candidateName: string;
  deletedAt: string;
  retentionDays: number;
  canManage: boolean;
}) {
  const purgeMs = new Date(deletedAt).getTime() + retentionDays * 86_400_000;
  // UTC-deterministic so this SSR'd client banner renders identical text on the
  // server and after hydration (a runtime-locale date trips React #418).
  const purgeLabel = formatDate(new Date(purgeMs));
  const archiveHref = `/api/candidates/${candidateId}/archive`;

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, eraseAction, erasing] = useActionState(
    eraseCandidateNow,
    EMPTY_FORM_STATE,
  );
  const nameMatches = typed.trim() === candidateName;

  return (
    <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-amber-900">
              In trash — scheduled for permanent erasure
            </p>
            <p className="text-xs text-amber-800">
              Personal data and files will be shredded on {purgeLabel}. Restore
              to keep them.
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <a href={archiveHref} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden />
              Download archive
            </a>
            <form action={restoreCandidateFromTrash}>
              <input type="hidden" name="id" value={candidateId} />
              <SubmitButton pendingLabel="Restoring…">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restore
              </SubmitButton>
            </form>
            <Button variant="danger" onClick={() => setOpen(true)}>
              <Trash2 className="h-4 w-4" aria-hidden />
              Erase permanently
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Erase ${candidateName} permanently?`}
      >
        <form action={eraseAction} className="space-y-4">
          <input type="hidden" name="id" value={candidateId} />
          <p className="text-sm text-slate-600">
            This skips the {retentionDays}-day window and erases the person now —
            personal data blanked, files shredded. It can&apos;t be undone.
          </p>
          <a
            href={archiveHref}
            className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download the archive first — this is your last chance.
          </a>
          <div>
            <label htmlFor="confirmName" className="text-xs text-slate-600">
              Type{" "}
              <span className="font-mono font-medium text-slate-900">
                {candidateName}
              </span>{" "}
              to confirm
            </label>
            <Input
              id="confirmName"
              name="confirmName"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1"
            />
            {state.fieldErrors?.confirmName && (
              <p className="mt-1 text-xs text-red-600">
                {state.fieldErrors.confirmName}
              </p>
            )}
          </div>
          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={erasing || !nameMatches}
            >
              {erasing ? "Erasing…" : "Erase permanently"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
