# 09 — Soft delete vs hard delete

> **In plain English.** When a user "deletes" something, you have a
> choice: actually erase the row from the database (hard delete),
> or just flip a flag that hides it (soft delete). Both are
> legitimate; the right call depends on whether you'll ever need
> that row again — for history, for compliance, or for the audit
> log.

## The technical core

**Hard delete.** `DELETE FROM jobs WHERE id = ?`. Row is gone. FKs
either cascade, restrict, or set null.

**Soft delete.** Add an `isActive`, `deletedAt`, or `status` column.
A "delete" sets the column. List queries filter `WHERE isActive =
true`. The row persists for history.

### When to soft-delete

- The row is referenced by other rows you'd lose context for
  (a submission references a candidate; if you delete the
  candidate, the submission is orphaned).
- You have an audit log and want it readable later ("who did
  this?" → soft-deleted user row still has a name).
- Compliance: regulators require retention of certain records.
- Reactivation is a real workflow ("undelete this account").

### When to hard-delete

- Privacy: GDPR right-to-be-forgotten. Soft delete isn't enough;
  the data has to be erased.
- Small ephemeral data — chat drafts, dismissed notifications.
- Data is genuinely worthless after deletion.

### The big trap

Soft delete bloats list queries with `WHERE isActive = true` and
forgetful developers omit it. Use scoped Prisma extensions, views,
or just be vigilant. (Worse: you forget the filter and leak deleted
data in a report.)

## Where it lives in LuminTrack

- **Org entities** (Client, Vendor, SisterCompanySource) — soft
  delete via `isActive` column. Historic jobs still link to them.
- **Users** — `isActive` column. `getCurrentUser` re-checks it on
  every request to lock out deactivated accounts.
- **Candidates** — `isActive` for soft delete *and* a separate
  `status` enum (`AVAILABLE | PLACED | NOT_INTERESTED |
  DO_NOT_CONTACT`) for engagement state. Two separate concepts.
- **Jobs, Submissions** — no delete at all. Retire via
  `JobStatus` (`CLOSED`, `CANCELLED`) or by changing
  `SubmissionStatus`.
- **Notes, Interview Rounds** — hard delete allowed (low-stakes),
  with audit row.
- **Resumes** — soft delete via `isActive` (archive). Archiving keeps
  the row, so any Submission that used it keeps its live
  `candidateResumeId` link (and the snapshot); archived résumés drop out
  of the library's active list and the submit picker. A true hard delete
  is allowed only for a résumé with **zero submissions** (safe cleanup of
  a mistaken add). Audit: `RESUME_ARCHIVED / RESUME_RESTORED /
  RESUME_DELETED`.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "I split the deletion model by entity importance. The 'big three'
> — Jobs, Candidates, Submissions — are never hard-deleted; they
> retire via status enums, so historic submissions still tell a
> coherent story. Org entities like Clients and Vendors use a
> classic `isActive` soft delete because old jobs still reference
> them and we want their names to render correctly years later.
> Small low-stakes data — Notes and Interview Rounds — can be
> hard-deleted, with enough audit context to reconstruct the delete.
> Résumés are the interesting middle case: they moved from hard delete
> to a soft delete (`isActive` archive) once we noticed a submission
> keeps a live FK to the résumé it used — so archiving preserves that
> link, and only an unused résumé can still be hard-deleted. If we ever
> had to handle a GDPR erasure request, we'd need a real anonymisation
> pass on the soft-deleted user records — that's an open item."

**Expect:**

- "How does this affect query performance?" → `isActive = true`
  in every list query; index includes it. Costs are minimal at our
  scale.
- "How would you handle GDPR?" → Hard delete + an anonymisation
  job that nulls or hashes referenced fields ("[deleted user]").
- "Why a separate `status` AND `isActive` on Candidates?" → They
  answer different questions. `status` is engagement; `isActive` is
  "do I still exist as a record at all".

## Mistakes to avoid saying

- ❌ "Soft delete is always safer." It's NOT safer for privacy.
- ❌ "Hard delete is faster." Marginal at typical scales.
- ❌ "I'd never hard-delete in a SaaS." Many SaaS hard-delete
  intentionally for storage cost + privacy reasons.

## Go deeper

- GDPR right-to-erasure: when soft delete is forbidden.
- "Tombstoning" — soft-delete pattern in distributed systems
  where a delete is a marker row that propagates.
