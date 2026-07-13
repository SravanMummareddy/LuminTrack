"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { formatGlossaryDisplayId } from "@/lib/format";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  saveGlossaryNote,
  saveCustomGlossaryTerm,
  deleteCustomGlossaryTerm,
} from "@/server/actions/glossary";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { GLOSSARY_CATEGORIES } from "@/lib/glossary";
import type { GlossaryRow } from "@/server/queries/glossary";

const CATEGORY_OPTIONS = [...GLOSSARY_CATEGORIES, "Custom"];

/**
 * Settings → Glossary. The curated domain vocabulary + org-wide custom terms
 * (admin-added), with a client-side search and a private per-user note per term.
 * Managers/team leads (`isAdmin`) can add / edit / remove custom terms.
 */
export function GlossarySection({
  rows,
  isAdmin,
  openEditId,
}: {
  rows: GlossaryRow[];
  isAdmin: boolean;
  /** When set (from `?edit=<id>`), open that row's dialog on load. */
  openEditId?: string;
}) {
  const [q, setQ] = useState("");
  // The add/edit dialog: "new", an existing custom row, or null (closed).
  const [editing, setEditing] = useState<null | "new" | GlossaryRow>(
    () =>
      openEditId ? rows.find((r) => r.customId === openEditId) ?? null : null,
  );
  const [deleting, setDeleting] = useState<GlossaryRow | null>(null);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      `${r.label} ${r.definition} ${r.note}`.toLowerCase().includes(t),
    );
  }, [q, rows]);

  // Render categories: the curated order first, then any extra bucket present
  // (e.g. "Custom") so a custom term's category is never silently dropped.
  const renderCats = useMemo(() => {
    const present = new Set(filtered.map((r) => r.category));
    const ordered = GLOSSARY_CATEGORIES.filter((c) => present.has(c));
    const extra = [...present]
      .filter((c) => !(GLOSSARY_CATEGORIES as readonly string[]).includes(c))
      .sort();
    return [...ordered, ...extra];
  }, [filtered]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Glossary</h2>
          <p className="text-xs text-slate-500">
            The vocabulary used across LuminTrack. Add a private note to any term
            — only you see your notes.
          </p>
        </div>
        {isAdmin && (
          <Button type="button" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add term
          </Button>
        )}
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="pl-8"
          aria-label="Search glossary"
        />
      </div>

      {renderCats.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No terms match “{q}”.
        </p>
      ) : (
        renderCats.map((cat) => {
          const items = filtered.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {cat}
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {items.map((r, i) => (
                  <div
                    key={r.term}
                    className={`grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(9rem,11rem)_1fr_minmax(12rem,15rem)] ${
                      i > 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                        {r.isCustom && r.customId ? (
                          <Link
                            href={`/settings/glossary/${r.customId}`}
                            className="text-indigo-600 hover:underline"
                          >
                            {r.label}
                          </Link>
                        ) : (
                          r.label
                        )}
                        {r.isCustom && (
                          <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                            Custom
                          </span>
                        )}
                        {r.isCustom && r.customSeq != null && (
                          <span className="font-mono text-[10px] text-slate-400">
                            {formatGlossaryDisplayId({ seq: r.customSeq })}
                          </span>
                        )}
                      </div>
                      {r.isCustom && r.addedBy && (
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          added by {r.addedBy}
                          {r.addedAt ? ` · ${r.addedAt}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="text-[13px] leading-relaxed text-slate-600">
                      {r.definition}
                    </div>
                    <div>
                      {isAdmin && r.isCustom && (
                        <div className="mb-1 flex justify-end gap-1.5">
                          <button
                            type="button"
                            title="Edit term"
                            aria-label="Edit term"
                            onClick={() => setEditing(r)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Remove term"
                            aria-label="Remove term"
                            onClick={() => setDeleting(r)}
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <NoteCell term={r.term} initialNote={r.note} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {isAdmin && editing && (
        <TermDialog
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {isAdmin && deleting && (
        <DeleteTermDialog row={deleting} onClose={() => setDeleting(null)} />
      )}
    </section>
  );
}

/** Add or edit a custom term. */
function TermDialog({
  row,
  onClose,
}: {
  row: GlossaryRow | null;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveCustomGlossaryTerm,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) {
      if (state.toast) toast({ tone: "success", title: state.toast.title });
      onClose();
    }
  }, [state, toast, onClose]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? "Edit glossary term" : "Add glossary term"}
      description="Everyone sees this term. Only managers and team leads can add or edit."
    >
      <form action={formAction} className="space-y-3">
        {row?.customId && <input type="hidden" name="customId" value={row.customId} />}
        <Field label="Term" htmlFor="label" error={state.fieldErrors?.label}>
          <Input
            id="label"
            name="label"
            defaultValue={row?.label ?? ""}
            maxLength={60}
            placeholder="e.g. Hotlist"
          />
        </Field>
        <Field label="Category" htmlFor="category" error={state.fieldErrors?.category}>
          <Select
            id="category"
            name="category"
            defaultValue={row?.category ?? "Custom"}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Definition"
          htmlFor="definition"
          error={state.fieldErrors?.definition}
        >
          <Textarea
            id="definition"
            name="definition"
            rows={3}
            maxLength={500}
            defaultValue={row?.definition ?? ""}
            placeholder="A short, plain-English definition."
          />
        </Field>
        {state.error && (
          <p role="alert" className="text-xs text-rose-600">
            {state.error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : row ? "Save changes" : "Add term"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Confirm + soft-delete a custom term. */
function DeleteTermDialog({
  row,
  onClose,
}: {
  row: GlossaryRow;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    deleteCustomGlossaryTerm,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) {
      if (state.toast) toast({ tone: "success", title: state.toast.title });
      onClose();
    }
  }, [state, toast, onClose]);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Remove glossary term"
      description={`Remove “${row.label}” from the glossary? It can be restored later.`}
    >
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="customId" value={row.customId ?? ""} />
        {state.error && (
          <p role="alert" className="text-xs text-rose-600">
            {state.error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Removing…" : "Remove term"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A single term's private note editor. Posts the note independently; Save
 *  appears only when the text changed. Blank + Save clears the note. */
function NoteCell({
  term,
  initialNote,
}: {
  term: string;
  initialNote: string;
}) {
  const [state, formAction, isPending] = useActionState(
    saveGlossaryNote,
    EMPTY_FORM_STATE,
  );
  const [note, setNote] = useState(initialNote);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && state.toast) toast({ tone: "success", title: state.toast.title });
  }, [state, toast]);

  const dirty = note.trim() !== initialNote.trim();

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="term" value={term} />
      <Textarea
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Add a personal note…"
        className="text-[13px]"
      />
      {dirty && (
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
          <button
            type="button"
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
            onClick={() => setNote(initialNote)}
          >
            Cancel
          </button>
        </div>
      )}
      {state.error && (
        <p role="alert" className="text-xs text-rose-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
