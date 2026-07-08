"use client";

import { useActionState, useState } from "react";
import { Trash2, Download, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { eraseCandidate } from "@/server/actions/candidates";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export function CandidateDangerZone({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(
    eraseCandidate,
    EMPTY_FORM_STATE,
  );
  const archiveHref = `/api/candidates/${candidateId}/archive`;
  const nameMatches = typed.trim() === candidateName;

  return (
    <section className="overflow-hidden rounded-lg border border-red-200">
      <div className="flex items-center gap-1.5 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Danger zone
      </div>
      <div className="space-y-4 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-800">
              Download archive
            </div>
            <p className="text-xs text-slate-500">
              Zip of profile, submissions, and all document files — to your device.
            </p>
          </div>
          <a href={archiveHref} className={buttonClass("secondary")}>
            <Download className="h-4 w-4" aria-hidden />
            Download archive
          </a>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <div className="text-sm font-medium text-slate-800">
              Erase personal data
            </div>
            <p className="text-xs text-slate-500">
              Right-to-be-forgotten. Shreds files, anonymizes the record. Cannot
              be undone.
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Erase permanently
          </Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Erase ${candidateName}?`}
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={candidateId} />
          <p className="text-sm text-slate-600">
            This permanently erases the person&apos;s identity and shreds their
            files. It can&apos;t be undone.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-red-50 p-2.5">
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-red-700 uppercase">
                Removed
              </div>
              <div className="text-xs leading-relaxed text-red-700">
                Name, email, phone
                <br />
                Location, skills, notes
                <br />
                Résumé + document files
              </div>
            </div>
            <div className="rounded-md bg-emerald-50 p-2.5">
              <div className="mb-1 text-[11px] font-semibold tracking-wide text-emerald-700 uppercase">
                Kept (anonymized)
              </div>
              <div className="text-xs leading-relaxed text-emerald-700">
                Submissions + outcomes
                <br />
                Placements + rates
                <br />
                Recruiter metrics
              </div>
            </div>
          </div>

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
              disabled={pending || !nameMatches}
            >
              {pending ? "Erasing…" : "Erase permanently"}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
