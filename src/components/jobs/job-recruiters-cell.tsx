"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Td } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { Button, buttonClass } from "@/components/ui/button";
import { assignJobRecruiters } from "@/server/actions/jobs";

type RecruiterOption = { id: string; fullName: string };

/**
 * Inline recruiter editor for the Jobs list "Recruiters" column. Admins get a
 * clickable cell that opens a popover with a checkbox grid; recruiters see the
 * same comma-joined name list as plain text. The popover reuses the Dialog
 * primitive (focus trap + Esc/overlay close come from there).
 */
export function JobRecruitersCell({
  jobId,
  currentRecruiters,
  allRecruiters,
  canEdit,
}: {
  jobId: string;
  currentRecruiters: { id: string; fullName: string }[];
  allRecruiters: RecruiterOption[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(currentRecruiters.map((r) => r.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const namesLabel = currentRecruiters.length
    ? currentRecruiters.map((r) => r.fullName).join(", ")
    : null;

  // Render path for non-admins: matches the original read-only cell exactly.
  if (!canEdit) {
    return (
      <Td label="Recruiters" secondary>
        {namesLabel ?? "—"}
      </Td>
    );
  }

  const openPicker = () => {
    setSelected(new Set(currentRecruiters.map((r) => r.id)));
    setError(null);
    setOpen(true);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await assignJobRecruiters(jobId, Array.from(selected));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <Td label="Recruiters" secondary>
      <button
        type="button"
        onClick={openPicker}
        aria-label={
          namesLabel
            ? `Assigned: ${namesLabel}. Click to change.`
            : "Assign recruiters"
        }
        className="-mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-left text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
      >
        <span className="truncate">
          {namesLabel ?? (
            <span className="text-indigo-600 hover:underline">— Assign</span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-slate-400" />
      </button>

      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Assign recruiters"
        description="Check the recruiters who should own this job. Changes are logged on the job timeline."
        className="max-w-md"
      >
        {allRecruiters.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
            No active recruiters. Add one under Settings → Users.
          </p>
        ) : (
          <ul className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {allRecruiters.map((r) => {
              const checked = selected.has(r.id);
              return (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="truncate text-slate-700">{r.fullName}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className={buttonClass("ghost", "sm")}
          >
            Cancel
          </button>
          <Button
            type="button"
            onClick={onSave}
            disabled={pending}
            size="sm"
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Dialog>
    </Td>
  );
}
