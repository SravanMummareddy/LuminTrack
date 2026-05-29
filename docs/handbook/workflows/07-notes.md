# Workflow 07 — Notes

> **In plain English.** A note is a free-text comment attached to a
> job, candidate, submission, or interview round. Use them for "the
> client said X over email" or "candidate has a 30-day notice."
> Different from the audit log: audit rows are *automatic* records
> of changes; notes are *people writing things on purpose*.

**Who uses it:** everyone.

**Where to find it:** on every detail page, in a "Notes" section
(usually below the timeline). For interview rounds, the notes
section is per-round, inside the round card.

## The note model

`Note` is polymorphic — exactly one of `jobId`, `candidateId`,
`submissionId`, `interviewRoundId` is set, matched by `entityType`.
See [`../04-database-schema.md`](../04-database-schema.md).

Fields:
- `body` — free text (markdown is rendered as plain text today, no
  formatting).
- `createdBy` — the User who wrote it.
- `createdAt` — when it was written.

There's no `updatedAt` — notes are immutable once written. If you
need to fix a typo, delete + re-add.

## Adding a note

In the Notes section on any detail page, type into the textarea and
hit "Post". The form submits `createNote(formData)`.

**Audit row.** `NOTE_ADDED`, attached to the same entity as the note.

## Editing / deleting

- **Edit:** not supported (immutable). Delete and re-add.
- **Delete:** allowed for the note's author and for admins. Audit
  row written? Today, no — deletes are silent. (Could be added; it
  hasn't been needed yet.)

## Code map

- Action: `src/server/actions/notes.ts`.
- Schema: `src/lib/validation/note.ts`.
- Query: notes are returned as part of the parent entity's query
  (`getJob`, `getCandidate`, `getSubmission`) — no separate notes
  query.
- UI: inline on each detail page.

## Why we built it this way

- **One table for all entity types.** Querying "everything ever
  said about this candidate" becomes one indexed lookup.
- **Immutability + author-only delete.** Notes are evidence. If a
  recruiter could rewrite a note silently, the value of having
  them drops.
- **No markdown rendering.** It's free text. We don't want to
  invite "but my markdown looks broken" complaints.
- **No reply threading.** Notes are flat. Threading would require
  a self-FK and a tree query for negligible gain.
