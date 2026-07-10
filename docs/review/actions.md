# Server Actions (mutations) — code review

Scope: `src/server/actions/*.ts`, lifecycle/helper files (`placement-lifecycle.ts`,
`bench-lifecycle.ts`, `submission-create.ts`, `activity.ts`, `lookups.ts`,
`team-lead.ts`, `candidate-erase.ts`, `job-erase.ts`).

Format: `path:line — problem — why it matters — suggested fix`.
Severity: Critical / Warning / Info.

---

## Critical

**C1. `src/server/actions/ilabor-import.ts:686-1042` — session-level advisory lock is acquired and released on a pooled Neon connection, which is not guaranteed to be the same physical connection.**
Why it matters: `PrismaNeon` (see `src/server/db.ts`) is a connection *pool*. `pg_advisory_lock`/`pg_advisory_unlock` are **session (connection) scoped**. The `pg_try_advisory_lock` in Phase A and the `pg_advisory_unlock` in the `finally` are two separate `$queryRaw` calls that can land on different pooled connections. If they do: (a) the unlock runs on a connection that never held the lock (returns `false`, no-op) and the lock stays held on the original connection until it is recycled, and (b) every subsequent import returns "Another import is already in progress" — a self-inflicted denial of the feature. The comment acknowledges the risk but treats connection reuse as "best effort"; correctness depends on it.
Suggested fix: Either (a) hold the lock inside a single transaction using `pg_try_advisory_xact_lock` (auto-released at tx end — the whole run then needs one tx, or the lock must wrap a dedicated tx you keep open), or (b) run acquire + all work + release on a single dedicated connection obtained explicitly (`prisma.$transaction`-scoped `tx.$queryRaw` for both lock and unlock), or (c) drop the advisory lock and rely on an application-level "import in progress" row with an optimistic guard.

---

## Warning

**W1. `src/server/actions/placements.ts:299-320` (`endPlacement`) — the replacement submission is not validated against being the placement's own submission, nor required to be a JOINED/active row.**
Why it matters: A recruiter can pick the *same* submission that produced this placement (or any same-job submission in any status, e.g. REJECTED) as its "replacement." That records a nonsensical replacement chain and can make `getPredecessorPlacement`/"Replaces PLC-###" show a self- or dead-end reference. Only `jobId` match and "not already a replacement for another placement" are checked.
Suggested fix: reject `replacementSubmissionId === existing.submissionId`, and constrain the picker/validation to submissions that are plausible replacements (e.g. not terminal/rejected, different candidate).

**W2. `src/server/actions/placements.ts:215-223` (`extendPlacement`) — overlap guard uses only the single most-recent extension by `endDate`, and never checks `d.endDate > d.startDate`.**
Why it matters: `lastEnd` = latest extension endDate (ordered desc) — but if an earlier extension has a later `endDate` than the “most recent by insert/endDate desc” assumption expects, or if `d.endDate` precedes `d.startDate`, an invalid/overlapping term can be written. The desc-by-endDate `take:1` covers the common case but an extension term where `endDate < startDate` is not rejected here (relies entirely on the Zod schema, which is not in this scope to confirm).
Suggested fix: assert `d.endDate > d.startDate` in the action, and consider validating against the max endDate across *all* extensions + the base term rather than a single row.

**W3. `src/server/actions/candidates.ts:408-434` (`eraseCandidateNow`) — `hardEraseCandidate` performs a Blob archive write (network I/O) and Blob file deletes outside/around the DB transaction; a failure window can scrub the DB row while leaving files, or vice-versa.**
Why it matters: The archive `put` runs before the tx (good — aborts on failure), but the file `del()` calls run *after* commit via `Promise.allSettled` (best-effort). If the process dies between commit and delete, personal-data blobs persist despite the candidate being marked erased — a data-retention/GDPR-adjacent gap for an action whose whole purpose is erasure. This is an accepted trade-off elsewhere but is more sensitive here than the audit-gap cases.
Suggested fix: record the outstanding blob URLs (e.g. on the candidate row or a purge queue) so a later sweep can retry deletion; or verify deletion succeeded and surface a warning when it didn’t.

**W4. `src/server/actions/users.ts:44-56` (`saveUser`) — a TEAM_LEAD can grant the TEAM_LEAD role to any recruiter, and edit other team leads, with no team scoping.**
Why it matters: The guard only blocks (a) non-managers granting MANAGER and (b) non-managers editing an existing MANAGER. A team lead can therefore promote arbitrary recruiters to TEAM_LEAD and edit peer team leads’ accounts (including resetting their password via the same form). For a <10-person team this may be intended, but it is a privilege-escalation surface worth an explicit owner decision rather than an implicit gap.
Suggested fix: confirm intent; if unintended, restrict TEAM_LEAD grant/peer-edit to MANAGER, or scope team-lead user management to their own `teamLabel`.

**W5. `src/server/actions/contacts.ts:78-95` (`saveContact`) — on edit (`id` present) the contact is not verified to belong to the supplied `parentId`/`kind`; the update reassigns the FK from the form.**
Why it matters: A crafted POST can move an existing contact under a different client/vendor/source (the `data` payload sets `[fk]: parentId` unconditionally). Manager-gated, so low blast radius, but it silently mutates ownership of shared org data with no audit trail (contacts write no Activity row).
Suggested fix: on edit, load the contact and reject if its current parent FK doesn’t match `parentId`/`kind`, or omit the FK from the update payload entirely on edit.

**W6. `src/server/actions/resumes.ts:31-95` & `src/server/actions/candidate-documents.ts:45-109` — uploads don’t check the candidate’s `deletedAt`/`erasedAt`, so files can be attached to a trashed/erased candidate.**
Why it matters: A file uploaded to an already-erased candidate lands in Blob and a new `CandidateResume`/`CandidateDocument` row after the erase scrub already ran, re-introducing PII on a “forgotten” record and creating a blob the erase job won’t revisit.
Suggested fix: select `deletedAt`/`erasedAt` in the candidate existence check and reject uploads to trashed/erased candidates.

---

## Info

**I1. `src/server/actions/ilabor-import.ts:945-967` — the CHANGED-row branch does per-row `prisma.$transaction` writes with no advisory lock covering the whole run (see C1). Two overlapping imports that both slipped past a broken lock could interleave JOB_UPDATED writes.** Dependent on C1; fixing C1 resolves it.

**I2. `src/server/actions/candidates.ts:579-587`, `src/server/actions/jobs.ts:590-596` — `removeCandidateArchive`/`removeJobArchive` log the audit row outside a transaction (Blob delete can’t join a tx).** Documented in-code (review IN-02); acceptable audit-gap-on-crash trade-off. No change required, noted for completeness.

**I3. `src/server/actions/org.ts`, `contacts.ts`, `glossary.ts`, `support.ts` — org-entity / contact / glossary / support-provider mutations write no Activity audit row.** Documented in-code (review IN-03) as a schema-migration trade-off; consistent and manager-gated. Noted only because it diverges from the “every mutation logs” invariant.

**I4. `src/server/actions/submissions.ts:239-262` — `createSubmission` builds gate results twice (up-front pre-check + re-check inside `createSubmissionRecord` under the lock).** Correct by design (race-safe), but the duplicated iLabor-cap/duplicate logic between `submissions.ts`, `requirements.ts`, and `submission-create.ts` is a maintenance hazard — a future change to one path can silently drift from the others. Consider consolidating the pre-check into `collectSubmissionGates` callers only.

**I5. `src/server/bench-lifecycle.ts:92-121` (`activateBenchOnSubmission`) — a submission reactivates an INACTIVE bench row but never re-markets a PLACED one (by design).** Intentional per owner decision; flagged only so reviewers don’t mistake it for a missed transition.
