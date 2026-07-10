"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveGlossaryNote } from "@/server/actions/glossary";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { GLOSSARY_CATEGORIES } from "@/lib/glossary";
import type { GlossaryRow } from "@/server/queries/glossary";

/**
 * Settings → Glossary. Curated domain vocabulary (definitions live in code) with
 * a client-side search and a private per-user note against each term. Available
 * to everyone — no admin gate.
 */
export function GlossarySection({ rows }: { rows: GlossaryRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      `${r.label} ${r.definition} ${r.note}`.toLowerCase().includes(t),
    );
  }, [q, rows]);

  const byCategory = GLOSSARY_CATEGORIES.map((cat) => ({
    cat,
    items: filtered.filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Glossary</h2>
          <p className="text-xs text-slate-500">
            The vocabulary used across LuminTrack. Add a private note to any term
            to remember it your way — only you can see your notes.
          </p>
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
      </div>

      {byCategory.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No terms match “{q}”.
        </p>
      ) : (
        byCategory.map(({ cat, items }) => (
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
                  <div className="text-sm font-medium text-slate-800">
                    {r.label}
                  </div>
                  <div className="text-[13px] leading-relaxed text-slate-600">
                    {r.definition}
                  </div>
                  <NoteCell term={r.term} initialNote={r.note} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/** A single term's private note editor. Posts the note independently; a Save
 *  appears only when the text has changed. Blank + Save clears the note. */
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
