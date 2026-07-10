# Code Review — Prisma schema, migrations, scripts, core lib logic

Reviewed 2026-07-10. Scope: `prisma/schema.prisma`, `prisma/migrations/*`,
seed/reconcile/backfill/restore scripts, `src/lib/{rates,labels,filters,format}.ts`.

Format: `path:line — problem — why it matters — suggested fix`.

---

## Critical

**C1. Backup/restore silently drops 4 tables, and restore will FK-violate on `SupportProvider`.**
`src/server/exporters/build-backup-json.ts:39-93` + `prisma/restore-from-backup.ts:43-66`
— The "restore-grade" JSON dump exports 19 tables but omits **`SupportProvider`,
`LookupOption`, `GlossaryNote`, `CustomGlossaryTerm`**. `INSERT_ORDER` in
`restore-from-backup.ts` mirrors the same 19 and never restores those four.
— Two failures: (a) **silent data loss** — support providers, learned lookup
values, and all glossary content vanish on a restore, so the "restore-grade"
claim in the file header (`restore-from-backup.ts:16`) is false; (b) **restore
can FK-violate** — `InterviewRound.supportProviderId` (schema.prisma:841-842) is a
real FK to `SupportProvider`; a backup taken after a round was linked to a
provider will re-insert that `interviewRound` row (INSERT_ORDER line 58) pointing
at a `supportProviderId` that was never restored → foreign-key constraint error
mid-restore (or a dangling reference if constraints are deferred). The migration
`20260710160000_support_providers` created this table well before the current
backup code, so any current DB is exposed.
— Fix: add `prisma.supportProvider.findMany()`, `lookupOption`, `glossaryNote`,
`customGlossaryTerm` to `build-backup-json.ts` (both the dump and the preflight
counts), and add them to `INSERT_ORDER`/`WIPE_ORDER` in the correct FK position
(`supportProvider` **before** `interviewRound`; `lookupOption` anywhere with no
FKs; `glossaryNote`/`customGlossaryTerm` after `user`). Bump `version` to 2 and
gate old backups, or make missing keys default to `[]` (already handled) — but
the export gap is the real bug.

---

## Warning

**W1. `formatExperience` diverges from every other Decimal formatter and can print raw Prisma Decimal object.**
`src/lib/format.ts:93-98` — Unlike `formatRate` (which coerces via `Number(...)`),
`formatExperience` calls `value.toString()` directly. A Prisma `Decimal(4,1)` of
`5.0` stringifies as `"5"` or `"5.0"` depending on the driver, and any non-finite
value is passed through verbatim (no `Number.isNaN` guard). `formatRate` guards;
this one does not, so an unexpected value renders as literal garbage rather than
`"—"`. — Fix: mirror `formatRate`'s coerce-and-NaN-guard:
`const n = Number(value.toString()); return Number.isNaN(n) ? "—" : `${n} yrs`;`.

**W2. Two migrations share the same timestamp directory prefix.**
`prisma/migrations/20260710120000_custom_glossary_terms` and
`prisma/migrations/20260710120000_vendor_recruited_by` — Identical `20260710120000`
prefix. Prisma orders migrations lexicographically by full folder name, so here
`custom_glossary_terms` sorts before `vendor_recruited_by` deterministically and
the two touch unrelated tables (`CustomGlossaryTerm` vs `Vendor`), so today it
happens to be safe. But same-timestamp migrations are a latent hazard: if a future
pair with a real dependency collides, apply order becomes name-alphabetical rather
than intended order, and `migrate diff`/drift tooling can misreport. — Fix: rename
one directory to a distinct timestamp (e.g. `20260710120100_vendor_recruited_by`)
before it ships anywhere it hasn't already been applied; going forward, generate
timestamps rather than hand-copying.

**W3. `parseDate` in filters accepts ambiguous/locale-dependent strings.**
`src/lib/filters.ts:17-21` — `new Date(value)` on a `?from=`/`?to=` param accepts
formats like `"01/02/2026"` whose interpretation is engine/locale-dependent, and
silently coerces partial strings. Only truly-unparseable input becomes `undefined`.
For a custom date-range filter this can select the wrong window without any error.
— Fix: constrain to ISO `YYYY-MM-DD` (the format the date inputs emit) with a
regex check before `new Date`, rejecting anything else to `undefined`.

---

## Info

**I1. `Placement.billRate`/`payRate` default to `0` (NOT NULL) while every sibling rate is nullable.**
`prisma/schema.prisma:762-763` — `Placement.billRate`/`payRate` are
`Decimal @default(0)` (non-null), whereas `Submission.payRate/billRate`,
`VendorRequirement.*`, and `Job.*Rate` are all nullable. A `0` default is
indistinguishable from "rates genuinely pending", which is exactly the state the
app surfaces as "⚠ Rates pending" (CLAUDE.md). Margin math on a `0`/`0` placement
computes a real `0` margin rather than "unknown". This is intentional per the
schema comment but worth confirming the "rates pending" detection keys off a
separate signal, not `billRate === 0`. — No fix required if detection is elsewhere;
flag for confirmation.

**I2. `rateChainWarnings` treats a rate of exactly `0` as "absent".**
`src/lib/rates.ts:25-29` — `toPositive` returns `null` for `0` (`n > 0`), so a
pay/bill/client rate deliberately entered as `0` is silently skipped from every
chain check. A `pay=0`/`bill=0` submission produces no warning even though it's a
degenerate rate. Given the money model, `0` is almost certainly "not entered", so
this is defensible — but it means the chain check can never flag a `0`-rate row.
— No change needed; documented so the behavior isn't mistaken for a bug later.

**I3. `deletedSuffix` uses truthiness, so an epoch-`0` date would be missed.**
`src/lib/format.ts:37-42` — `entity.deletedAt || entity.erasedAt` — a `Date`
object is always truthy, and Prisma returns `Date | null`, so this is correct in
practice. Only a raw `""`/`0` string could slip through, which the typed inputs
prevent. — No change; noted for completeness.

**I4. `labels.ts` enum→label maps are exhaustive and correct.**
Verified every `Record<Enum, ...>` in `labels.ts` against the Prisma enums:
`JobStatus`, `WorkMode`, `JobPriority`, `Discipline`, `CandidateStatus`,
`SubmissionStatus` (all 11 incl. `BACKED_OUT`), `InterviewType`, `InterviewResult`,
`PlacementStatus`, `PlacementEndReason`, `BenchPriority`, `BenchMarketingStatus`,
`BenchEngagement`, `RequirementStatus` — all fully mapped, no missing case. Because
they use `Record<Enum, ...>`, a future enum value add fails `tsc`, which is the
right guardrail. No action.

**I5. Enum-add-then-use splits are all correct.**
Verified: `submission_backed_out_status`, `data_exported_action`,
`placement_audit_actions`, `requirement_audit_enums`, `requirement_deleted_action`,
`bench_p0_enum_values_user_fields`, and the two-step role rename
(`user_roles_manager_teamlead` adds `TEAM_LEAD`; `migrate_teamlead_and_drop_flag`
*uses* it in a later migration). No migration adds an enum value and consumes it in
the same transaction. `retire_candidate_rate` cleanly drops the three
`candidateRate` columns. No action.

**I6. seed-demo + reconcile scripts are FK-safe / idempotent.**
`seed-demo.ts:556-581` wipes children-before-parents and covers all current
tables incl. the previously-missed Placements/Documents/Bench. `reconcile-bench-status.ts`
and `reconcile-vpr-status.ts` both re-query the stale set on each run and no-op
once reconciled. No action.
