# LuminTrack — Whole-Codebase Deep Code Review

**Date:** 2026-07-10 · **Branch:** `main` · **Scope:** entire `src/` + Prisma layer
(~338 TS/TSX files, ~52.6k LOC). Read-only review; no source changed.

Reviewed by 6 parallel domain reviewers (auth, server actions, queries/exporters,
routes/API, UI components, prisma/scripts/lib). Per-domain detail lives in
`docs/review/{auth,actions,queries,routes,components,prisma}.md`.

## Summary

| Domain | Critical | Warning | Info |
|---|---|---|---|
| Auth / session / permissions | 0 | 2 | 4 |
| Server actions (mutations) | 1 | 6 | 5 |
| Server queries + exporters | 0 | 7 | 6 |
| App routes & API handlers | 0 | 3 | 4 |
| UI components | 0 | 4 | 2 |
| Prisma / migrations / lib | 1 | 3 | 6 |
| **Total** | **2** | **25** | **27** |

**Overall:** the codebase is in good shape on its highest-risk surfaces — JWT/session
handling, RBAC funnelling through `hasFullAccess`, audit atomicity (write + `logActivity`
in one `$transaction`), Next.js 16 async-request-API discipline, React-19 form-reset
safety, and enum/label exhaustiveness are all sound in the mainline paths. The findings
cluster in **three themes**: (1) a broken rate-edit RBAC gate, (2) backup/restore
completeness + PII exposure, and (3) a handful of forms/actions that missed the
project's own established safety patterns.

### Highest-risk cluster (fix first)

The two Criticals plus the rate-gate Warning are the actionable priorities. Everything
else is robustness/UX hardening or needs an owner policy decision.

---

## Critical

> **Status 2026-07-10:** C1 and C2 both **FIXED** (see DEVLOG). tsc clean, 179 tests pass.

### C1 — Placement rate-edit RBAC gate is dead code (silent data loss) — ✅ FIXED
`src/server/actions/placements.ts:32`
`canEditRates` returns `args.userRole === "ADMIN" || userId === submittedById`, but
**`UserRole` has no `ADMIN` value** — the enum is `MANAGER | TEAM_LEAD | RECRUITER`
(schema.prisma:15-19; `ADMIN` was retired). The literal is therefore always false, so
the gate collapses to "only the recruiter-of-record may edit rates." Meanwhile the
detail page shows the rate fields as editable to any `hasFullAccess` user
(`placements/[id]/page.tsx`), so a **manager/team-lead edits bill/pay/client rates, hits
Save, and the action silently discards them** (`mayEditRates` false) — a broken gate
*and* silent loss of commercial data for exactly the users meant to own it.
*Verified:* the only live `"ADMIN"` string in `src/` outside a comment.
**Fix:** `return hasFullAccess({ role: userRole as UserRole }) || userId === submittedById;`
(import the shared helper; drop the string literal).

### C2 — "Restore-grade" backup silently drops 4 tables and FK-violates on restore — ✅ FIXED
`src/server/exporters/build-backup-json.ts:39-67` + `prisma/restore-from-backup.ts`
The dump exports 19 tables but omits **`SupportProvider`, `LookupOption`, `GlossaryNote`,
`CustomGlossaryTerm`** (confirmed — no `findMany` for any of them). Two failures:
(a) **silent data loss** — support providers, learned lookup values, and all glossary
content vanish on restore, falsifying the "restore-grade" header claim; (b) **restore
FK-violates** — `InterviewRound.supportProviderId` is a real FK to `SupportProvider`,
and `interviewRound` *is* re-inserted from the backup, pointing at a provider row that was
never restored → constraint error mid-restore.
**Fix:** add the four `findMany`s to the dump + preflight counts, and add them to
`INSERT_ORDER`/`WIPE_ORDER` in FK-correct position (`supportProvider` **before**
`interviewRound`; `lookupOption` anywhere; glossary tables after `user`). Bump backup
`version`.

---

## Warning (25)

**Security / authorization**
- **A-W1 (also queries WR-01/02, routes W1) — Backup + full-export leak PII with no
  builder-level gate.** `build-backup-json.ts` dumps every candidate, document (incl.
  Identity/Work-Auth), contact, submission rates, and **`benchConsultant.marketingPassword`
  in cleartext** — redacting only `User.passwordHash`. `getBenchConsultant` deliberately
  omits `marketingPassword`; the backup re-exposes it. Route gating is currently correct
  (`hasFullAccess`), so this is defense-in-depth: add `assertAdmin(viewer)` inside the
  builder and `omit: { marketingPassword: true }` unless explicitly requested.
- **routes W1 — `/api/resumes/[id]` IDOR.** Any signed-in user can download any
  candidate's résumé (PII) by iterating IDs — no category/ownership gate, unlike the
  sibling `/api/documents/[id]`. **Needs owner decision:** if org-wide résumé read is
  intended (like bench credentials), document it; otherwise gate to admin-or-linked-recruiter.
- **actions W4 — TEAM_LEAD can grant TEAM_LEAD and edit peer team-leads** (incl. password
  reset) with no team scoping (`users.ts:44-56`). Low blast radius (<10 users) but a
  privilege-escalation surface. **Owner decision.**
- **actions W5 — `saveContact` reassigns a contact's parent FK from the form on edit**
  without verifying current ownership (`contacts.ts:78-95`); a crafted POST can move a
  contact under a different client/vendor/source. Load-and-verify parent, or omit the FK on edit.
- **auth W2 — `canViewBenchCredentials` keys off `Boolean(viewer?.role)`** instead of the
  viewer object (`permissions.ts:62`); not exploitable today but bypasses the `hasFullAccess`
  discipline. Use `Boolean(viewer)`.

**Correctness / data integrity**
- **actions C1(→listed Critical in its domain) — iLabor import advisory lock on a pooled
  connection.** `pg_advisory_lock`/`unlock` are session-scoped but run as separate
  `$queryRaw` calls on a pooled Neon connection, so the unlock can hit a different
  connection — leaving the lock stuck and permanently blocking future imports
  (`ilabor-import.ts:686-1042`). Use `pg_try_advisory_xact_lock` in a transaction, or a
  single dedicated connection for acquire+work+release. *(Rated Critical by the actions
  reviewer; kept as Warning here since it self-heals on connection recycle and is
  import-only, but treat as near-Critical.)*
- **actions W1 — `endPlacement` doesn't reject the placement's own submission (or terminal
  ones) as its "replacement"** (`placements.ts:299`), producing self/dead-end replacement chains.
- **actions W2 — `extendPlacement` overlap guard checks only the latest extension by
  endDate and never asserts `endDate > startDate`** (`placements.ts:215`).
- **actions W6 — résumé/document uploads don't check candidate `deletedAt`/`erasedAt`**
  (`resumes.ts`, `candidate-documents.ts`), re-introducing PII onto an erased candidate.
- **actions W3 — `hardEraseCandidate` deletes blobs post-commit best-effort**; a crash
  between commit and delete leaves PII blobs on a "forgotten" record — more sensitive here
  than the accepted audit-gap cases. Record outstanding URLs for a retry sweep.
- **prisma W1 — `formatExperience` calls `value.toString()` with no NaN guard**
  (`format.ts:93`), unlike `formatRate`; a raw Decimal/non-finite renders as garbage
  instead of `"—"`.
- **prisma W2 — two migrations share prefix `20260710120000`** (`custom_glossary_terms`
  and `vendor_recruited_by`); safe today (unrelated tables, deterministic name sort) but a
  latent ordering hazard. Rename one to a distinct timestamp before it ships further.
- **prisma W3 / filters — `parseDate` uses `new Date(value)`** on `?from=/?to=` params,
  accepting locale-ambiguous formats (`filters.ts:17`); constrain to ISO `YYYY-MM-DD`.

**Query hygiene / analytics correctness**
- **queries WR-03/WR-05 — analytics + placement queries don't filter trashed/erased
  parents.** `listPlacements`/reports/dashboard scans include submissions/placements on
  trashed jobs/candidates, inflating recruiter counts/margins and potentially surfacing
  erased names un-annotated. Verify `deletedSuffix()` is applied downstream and/or add
  `deletedAt: null` to the analytics `where` builders.
- **queries WR-04 — skill filter fetches the entire candidate table unpaginated**
  (`candidates.ts:99`); add a cap or push into SQL.
- **queries WR-06/WR-07 — global search skill match is case-sensitive exact (`has: q`)**,
  inconsistent with the lowercased list filter, so typeahead misses skill hits
  (`search.ts:27`); `candidateOR` type smell alongside.

**UI (React-19 form-reset class — the documented `submittedById` bug, unfixed in 4 forms)**
- **components W1 — `job-form.tsx` is uncontrolled** (`status`/`discipline` selects + all
  `defaultValue` inputs). Since `createJob`/`updateJob` return `fieldErrors` without
  redirecting, a validation error triggers React 19's post-action `form.reset()`: text
  reverts and selects **silently snap to the first option** (job downgraded to `OPEN`,
  rates wiped). Convert to controlled `value` + `selectSyncKey` remount key like
  `candidate-form`/`submission-form`.
- **components W2/W3/W4 — same class** in `interview-round-form.tsx` (result can revert
  REJECTED→WAITING), `document-form.tsx` (Identity doc silently reposts as Work-Auth — the
  admin-gated sensitive categories), and `placement-end-form`/`placement-edit-form` (rate
  reverts). Apply the same controlled+remount fix.

---

## Info (selected)

Full list in the per-domain files. Notable ones:
- **queries IN-03 — six hand-rolled `flatten*` Decimal helpers** across query files — the
  exact pattern that caused past Decimal-leak crashes; extract a shared
  `flattenDecimals(row, keys)` + test.
- **routes I1 — export audit rows set `entityType: "JOB"`** for whole-DB exports,
  mis-bucketing the audit filter.
- **routes W3 / I2 — export audit logged before delivery** (over-reports on client abort);
  **`export/full` still buffers + pretty-prints** the whole dump while `export/excel`
  streams.
- **prisma I1 — `Placement.billRate/payRate` default `0` NOT NULL** while all sibling
  rates are nullable; confirm "rates pending" detection doesn't key off `=== 0`.
- **queries IN-01 — candidate archive display ID uses `padStart(3)`** vs the app's
  `padStart(4)` (`CAND-001` vs `CAND-0001`).
- **queries IN-06 — recycle-bin blob listing doesn't paginate the `cursor`** — old backups
  silently vanish past the first page.
- **auth I4 — no token revocation on password change** (stateless JWT; `sub`-only); bounded
  by the `isActive` re-check. Acceptable for <10 users; documented.

---

## Recommended order of work

1. **C1 placements rate gate** — one-line fix, active RBAC bug + silent data loss. *(quick win)*
2. **C2 backup 4-table gap** — data-loss + broken restore; add tables to dump + INSERT_ORDER.
3. **iLabor advisory-lock** (actions C1) — switch to `pg_advisory_xact_lock`.
4. **Backup PII / `marketingPassword` redaction** (A-W1) — builder-level gate + `omit`.
5. **UI form-reset fixes** (W1-W4) — mechanical, follow the existing controlled+`selectSyncKey` pattern; `job-form` first.
6. **Upload-to-erased-candidate + contact-reparent guards** (actions W5/W6).

## Needs owner decision (not code bugs until confirmed)
- `/api/resumes/[id]` org-wide read vs. row-level authz (routes W1).
- TEAM_LEAD user-management scope (actions W4).
- Whether analytics should intentionally include trashed work (queries WR-05).

## Verification performed
- Spot-checked C1 (`placements.ts:32` + `UserRole` enum + grep of live `"ADMIN"` strings) —
  confirmed dead literal.
- Spot-checked C2 (`build-backup-json.ts` `findMany` list) — confirmed `supportProvider`/
  `lookupOption`/`glossaryNote`/`customGlossaryTerm` absent while `interviewRound` present.
- Cross-checked findings against CLAUDE.md invariants (audit atomicity, `deletedAt: null`
  filtering, React-19 select pattern) to filter false positives.

*This is a report only — no fixes applied. Triage, then run a targeted `--fix` pass per finding.*
