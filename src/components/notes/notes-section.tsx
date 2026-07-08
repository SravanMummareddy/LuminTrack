"use client";

import { useActionState, useEffect } from "react";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createNote } from "@/server/actions/notes";
import { formatDateTime } from "@/lib/format";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { EntityType } from "@/generated/prisma/enums";

type Note = {
  id: string;
  body: string;
  createdAt: Date | string;
  createdBy: { fullName: string };
};

/**
 * Polymorphic notes thread (spec §7.9) for a job / candidate / submission.
 * The add form is uncontrolled — React 19 clears it on submit, which is the
 * desired behaviour after posting a note; `revalidatePath` refreshes the list.
 */
export function NotesSection({
  entityType,
  entityId,
  notes,
  title = "Notes",
}: {
  entityType: EntityType;
  entityId: string;
  notes: Note[];
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createNote,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  // Confirm the save — createNote revalidates rather than redirecting. `state`
  // is a fresh object per submit, so each added note re-fires the toast.
  useEffect(() => {
    if (state.ok) toast({ tone: "success", title: "Note added" });
  }, [state, toast]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        {title} ({notes.length})
      </h2>

      <form action={formAction} className="space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <Textarea
          name="body"
          rows={3}
          maxLength={5000}
          required
          aria-label="Note text"
          placeholder="Add a note…"
        />
        {state.error && (
          <p className="text-xs font-medium text-red-600">{state.error}</p>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </form>

      {notes.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {notes.map((note) => (
            <li key={note.id}>
              <p className="whitespace-pre-wrap text-sm text-slate-800">
                {note.body}
              </p>
              <p className="mt-0.5 text-xs text-slate-400" suppressHydrationWarning>
                {note.createdBy.fullName} · {formatDateTime(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
