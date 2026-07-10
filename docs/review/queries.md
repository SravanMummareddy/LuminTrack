# Code Review — Server Queries + Exporters

Scope: `src/server/queries/*.ts`, `src/server/exporters/*.ts`
Reviewed: 2026-07-10
Reviewer: adversarial code review (queries + exporters domain)

Format: `path:line — problem — why it matters — suggested fix`

---

## Critical

_None found that are outright data-loss or auth-bypass. Two high-impact PII items are under Warning below — treat CR-adjacent._

---

## Warning

### WR-01 — Full JSON backup leaks candidate/consultant PII with no role gate at the builder
`src/server/exporters/build-backup-json.ts:57-67` — `buildBackupJson()` dumps every `candidate`, `candidateResume` (Blob pathnames), `candidateDocument` (incl. Identity / Work-Auth categories), `contact`, `benchConsultant` (incl. `marketingPassword`), and `submission` (rates) with **no viewer/role parameter**. The only redaction is `User.passwordHash`. — The stated contract (CLAUDE.md / file header) is "admin-only disaster recovery," but the builder itself enforces nothing; correctness depends entirely on the route handler gating it. A single mis-wired caller exports the whole PII surface, and `benchConsultant.marketingPassword` (a live third-party credential) is included in cleartext. — Add an explicit `assertAdmin(viewer)` (or accept a `viewer` and hard-fail) inside the builder, and at minimum `omit: { marketingPassword: true }` on the `benchConsultant.findMany` unless a caller opts in. Defense-in-depth, mirroring `getBenchConsultant`'s `omit`.

### WR-02 — Bench marketing password included in the restore-grade backup
`src/server/exporters/build-backup-json.ts:64` — `prisma.benchConsultant.findMany()` selects all columns including `marketingPassword`. — `getBenchConsultant` deliberately drops this field unless `includeCredentials`; the backup path silently re-exposes it in a downloadable file. A backup JSON landing anywhere (email, laptop, S3) leaks every consultant's marketing-portal password. — Either omit it, or store/return it only under an explicit credentials flag. If it must be in the backup for true restore, document that the backup is credential-bearing and require it be encrypted at rest.

### WR-03 — `getReplacementCandidates` excludes trashed candidates but NOT erased ones
`src/server/queries/placements.ts:359` — filters `candidate: { deletedAt: null }`. Erased tombstones keep `deletedAt` set (per the trash→erase ladder: erased rows retain `deletedAt` AND set `erasedAt`), so `deletedAt: null` does exclude them here — OK. **However** this is the only place in the file that filters candidate soft-delete; `listPlacements`, `getPlacement`, `getCandidatePlacements`, `getActivePlacementForCandidate` return placements whose candidate/job may be trashed/erased with no filter. — A placement for a trashed candidate still renders their real name in the list. That is by design elsewhere (the row carries `deletedAt`/`erasedAt` so the UI can append "(deleted)"), so verify the placement list/detail components actually apply `deletedSuffix()`. If they don't, trashed-candidate names leak un-annotated. — Confirm the client components consume the `deletedAt`/`erasedAt` fields; otherwise add the suffix or filter.

### WR-04 — In-memory skill filter fetches the entire candidate table unpaginated
`src/server/queries/candidates.ts:99-115` — when a `skill` filter is supplied, `findMany` runs with `where` but **no `take`**, pulling every matching candidate into memory before slicing. — On a growing candidate table this is an unbounded fetch on a hot list path; the comment acknowledges it but there is no cap. For a <10-recruiter tool it's tolerable now, but it silently degrades and there's no ceiling like the `take: 200` used elsewhere (timeline, reports). — Add a sane cap (e.g. `take: 2000`) or push the skill match into a raw SQL `array` predicate (`skills && ARRAY[...]` / `ILIKE ANY`).

### WR-05 — Reports `staleSubs` / dashboard queries do not filter out trashed jobs/candidates
`src/server/queries/reports.ts:100-124`, `src/server/queries/dashboard.ts:17-40` — `buildSubmissionWhere(filters)` (not in scope but relied on here) and the recruiter-aging / placement-margin scans have no `job.deletedAt: null` / `candidate.deletedAt: null` guard. — Submissions/placements attached to a trashed or erased job still contribute to recruiter performance counts, aging tables, and margin projections, and `recruiterAging` renders the candidate/job names. This inflates analytics and can surface names of erased records. — Verify `buildSubmissionWhere` filters soft-deleted parents; if not, add `job: { deletedAt: null }` (and candidate) to the analytics `where` builders, or intentionally document that analytics counts trashed work.

### WR-06 — `candidateOR` / `jobOR` typed as possibly-undefined then `.push`-ed
`src/server/queries/search.ts:22-36` — `candidateOR` is typed `Prisma.CandidateWhereInput["OR"]` which is `... | undefined`; it's initialized to an array literal so runtime is fine, but `candidateOR.push(...)` would throw if the type ever resolves to a non-array union member. Minor type-safety smell. — Low risk today, but a Prisma type change could make this a runtime `push of undefined`. — Type as `NonNullable<Prisma.CandidateWhereInput["OR"]> & unknown[]` or `Prisma.CandidateWhereInput[]`.

### WR-07 — `search.ts` `skills: { has: q }` is case-sensitive and exact-element
`src/server/queries/search.ts:27` — every other search predicate uses `mode: "insensitive"` `contains`, but the skills match uses `has: q` (exact, case-sensitive array-element equality). — Typing "react" won't match a stored `"React"` skill, so global search silently misses skill hits — inconsistent with the candidate list's lowercased skill filter. — Lowercase the stored skills or drop the skills clause from typeahead (it can't be made case-insensitive on an array via Prisma without raw SQL).

---

## Info

### IN-01 — Candidate archive display ID uses `padStart(3)` — inconsistent with the app's `padStart(4)`
`src/server/exporters/build-candidate-archive.ts:77` — `CAND-${String(c.seq).padStart(3, "0")}`. The Excel exporter (`build-business-excel.ts:135`) and the rest of the app pad candidate seq to 4 digits (`CAND-0001`). — The backup zip's internal `displayId` (and the recycle-bin summary derived from it) shows `CAND-001` while the UI shows `CAND-0001` for the same candidate. Cosmetic mismatch, but confusing when reconciling a backup against a live record. — Use `padStart(4, "0")` to match `build-business-excel.ts` and `listCandidateArchives`' `CAND-\d+` parse.

### IN-02 — `submissions.ts` `getJobSubmittedCandidateIds` fetches all rows to map one field
`src/server/queries/submissions.ts:406-414` — `findMany({ select: { candidateId } })` over all submissions for a job. Fine for volume, but `distinct: ["candidateId"]` would return fewer rows and directly express intent (duplicate flagging only needs the set). — Micro-efficiency + clarity.

### IN-03 — Duplicate near-identical `flatten*` Decimal helpers across query files
`candidates.ts:135`, `submissions.ts:95`, `placements.ts:50`, `requirements.ts:87`, `bench-consultants.ts:52`, `jobs.ts:166` — each file hand-rolls its own Decimal→number flatten. — This is the exact pattern that caused past crashes when a new Decimal column was missed (per CLAUDE.md). Six independent copies means six places to forget the next new Decimal column. — Consider a shared `flattenDecimals(row, keys)` helper so adding a rate column is a one-line change and can be covered by a single test.

### IN-04 — `getMonthlyScorecard` scans the entire submission table every render
`src/server/queries/monthly-scorecard.ts:186-193` — `vendorHistory` = `prisma.submission.findMany()` with no `where` and no `take`, to compute company-first-vendor. — Documented as intentional ("small dataset, cheap"), but it's an unbounded full-table scan on a user-facing page with no ceiling. — Fine at current scale; add a note / cap if submission volume grows, or precompute vendor-first-seen.

### IN-05 — `getExpiringDocuments` `take: 50` silently truncates the dashboard widget
`src/server/queries/candidates.ts:224-231` — hard cap of 50 with no "and N more" signal returned. — If >50 docs expire in the window, the widget shows an incomplete compliance picture with no indication anything was dropped. — Return a `total`/`hasMore` alongside the rows, or raise the cap for the org-scope admin view.

### IN-06 — `listCandidateArchives` / `listJobArchives` don't paginate the Blob listing
`candidate-archives.ts:22`, `job-archives.ts:18` — `list({ prefix })` returns the first page of blobs only (Vercel Blob `list` is paginated via `cursor`); results are then sorted in memory. — On a store with many erased backups the recycle bin silently shows only the first page (newest-by-Blob-order, not guaranteed newest-by-timestamp before the in-memory sort). — Loop on `cursor` (or document the cap) so old backups don't vanish from the bin.
