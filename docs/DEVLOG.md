# LuminTrack DEVLOG — issues, diagnoses, fixes, lessons

Running record of non-trivial problems encountered during build and
how we solved them. Each entry is a self-contained interview story:
**Situation → Diagnosis → Fix → Lesson**.

The goal is to remember the *thought process*, not just the diff —
so each entry calls out the engineering principle that made the fix
short instead of long.

---

## 2026-06-20 · `seed-demo` wipe predated three feature areas → FK violation on re-seed

**Situation.** After shipping the Monthly Performance scorecard (which needed
`SubmissionStatus.BACKED_OUT` + `empId`/`teamLabel` on recruiters), re-running
`prisma/seed-demo.ts` to regenerate sample data crashed at the user-delete step
with `P2003 ForeignKeyConstraintViolation` on `User`.

**Diagnosis.** The seed's "wipe existing data" block was a hand-maintained list
of `deleteMany()` calls written back in Phase 7. Since then we'd added
Placements + PlacementExtensions (R4.2), CandidateDocuments (R4.1), JobPortals,
Contacts, and now BenchConsultants — **none of which were in the wipe list.** On
a *fresh* DB the omission was invisible (nothing to delete), but the moment any
of those tables held a row that referenced a User or Candidate (e.g. the BC-001
bench consultant created during P1), deleting users blew up on the dangling FK.
A silent gap that only surfaces once the referencing table is non-empty is the
worst kind: it passes every test until real data exists.

**Fix.** Rewrote the wipe as a single FK-safe cascade (children → parents):
activity/note → placementExtension/placement → interviewRound/benchConsultant →
submission → candidateDocument/candidateResume/jobAssignment → job → candidate →
contact/jobPortal → vendor/client/source → user, with a comment explaining the
ordering invariant so the next table addition has an obvious home.

**Lesson.** A destructive teardown must enumerate *every* table that can hold an
FK to what it deletes — and that list rots silently as the schema grows. Either
derive the delete order from the schema, or treat "add a model" as also meaning
"add it to the wipe." When a delete is FK-ordered, write the ordering rationale
next to it so the list is maintainable, not archaeology.

---

## 2026-06-20 · Seeded `BACKED_OUT` only in the oldest age bucket → scorecard column looked broken

**Situation.** The Monthly Performance scorecard has a Backouts column. After
wiring it up, the current month's column was entirely empty, and a DB count
showed **zero** `BACKED_OUT` submissions total — even though I'd added
`["BACKED_OUT", 1]` to the seed's status mix.

**Diagnosis.** Two compounding issues. (1) I'd added the weight to only the
`age >= 45 days` bucket of `pickFinalStatus`. Backouts bucket on `submittedAt`,
and a 45+-day-old submission was submitted in March/April — so by construction a
backout could *never* land in a recent month's column. (2) The seed RNG is a
*deterministic* PRNG, and that single low-weight entry in one bucket happened to
roll zero across the whole run. So the feature looked broken in exactly the view
a stakeholder would open first (the current month).

**Fix.** Added modest `BACKED_OUT` weight to the recent buckets too
(`age < 20`, `age < 45`) and bumped the oldest to 2, so a fast
offer-then-backout shows up in the current month. Re-seed: 3 total, 1 in June —
the column now renders a red `1` cell that reconciles against the submissions.

**Lesson.** Demo data has to exercise the feature *in the view the audience will
actually look at*, not just somewhere in the table. A metric bucketed by date
needs sample rows whose date lands in the default window — and with a fixed-seed
PRNG, "low probability" effectively means "verify it actually happened," because
there's no second roll. Always count the rows after seeding a new metric.

---

## 2026-06-20 · A phantom migration in the shared dev DB blocked all new migrations

**Situation.** Starting the Bench-Sales build, the very first
`prisma migrate dev` (adding bench enum values + two `User` columns)
refused to run and announced it needed to **reset the database** — drop
all data — to proceed. The reported reason was "drift": the live Neon dev
DB contained a migration `20260530052124_resume_soft_delete` (adding
`CandidateResume.isActive` + `RESUME_ARCHIVED`/`RESUME_RESTORED` actions)
that existed in the migration *history table* but in no local migration
folder.

**Diagnosis.** Searched every branch, commit, stash, and reflog
(`git log --all -S`, `git branch -a`) for the migration name and the
`isActive` field — **zero hits**. The schema change had been applied to
the shared Neon database by some working copy (another machine / an
unpushed branch / a throwaway session) and was never committed here. So
the DB was strictly *ahead* of the repo by one feature's worth of schema,
and Prisma's `migrate dev` correctly refuses to evolve a database whose
state it can't reconstruct from migration files — its only safe offer is a
reset. Before touching anything, I counted rows to classify the data: 8
users (the seed-demo set), 30 candidates, ~162 submissions, 357 jobs — i.e.
regenerable demo seed + a 306-row iLabor import test, not hand-entered
production data.

**Fix.** Because the data was disposable, the product owner chose
**reset + reseed** over reverse-engineering the lost migration. Prisma 7
added an AI-agent guardrail that blocks destructive commands unless you
pass `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` set to the user's exact
consent text — so this required an explicit typed "yes" first. Then:
`migrate reset --force` (re-applied the 26 committed migrations cleanly,
clearing the orphan) → hand-authored the bench migration via
`prisma migrate diff --from-config-datasource --to-schema` + `migrate
deploy` (because `migrate dev` is interactive and the agent shell is
non-interactive — it wouldn't acknowledge the `empId` unique-constraint
warning) → `npx tsx prisma/seed-demo.ts` to restore the demo dataset.

**Lesson / interview framing.** Two transferable points. (1) **A shared
dev database is mutable global state**; when migration history diverges
from version control, trust the committed migrations as source of truth and
*classify the data before reaching for reset* — the right call hinges
entirely on whether the rows are precious or regenerable, which is a
one-query question. (2) When `migrate dev` fights you in automation, drop to
its plumbing: `migrate diff` to render the exact SQL and `migrate deploy` to
apply a hand-written migration file — same result, fully non-interactive,
and you get to eyeball the SQL (here: confirming the enum `ADD VALUE`s
weren't *used* in the same migration, so they were safe to ship in one
file). The new Prisma consent gate is also worth knowing about: destructive
commands now hard-stop AI agents by design.

---

## 2026-05-28 · iLabor import "expired transaction" — wrong layer was the culprit

**Situation.** The 306-row iLabor sample import started failing on
the confirm step with:
> Transaction API error: A query cannot be executed on an expired
> transaction. The timeout for this transaction was 60000 ms,
> however 60251 ms passed since the start of the transaction.
Stack trace pointed inside `logActivity` (`src/server/activity.ts`),
which made it look like the audit-write helper was broken.

**Diagnosis.** `logActivity` was just the messenger — it was the
*next* statement Prisma tried to send after the transaction budget
ran out. The real cause was the shape of `importRequisitions`
(`src/server/actions/ilabor-import.ts`): one big interactive
`$transaction(..., { timeout: 60_000 })` wrapping advisory-lock +
portal upsert + existing-rows query + N×(vendor/client resolve) +
~300 job upserts + per-row JOB_IMPORTED / JOB_UPDATED audit rows +
summary audit. That's ~700–900 sequential statements. On Neon's
serverless driver each round-trip costs tens of ms of network
latency — the DB does microseconds of work, the wire does the
rest. 60s budget gone, transaction killed, next insert throws.
Not a Neon quota issue (storage, connections, egress all fine); a
pure Prisma interactive-transaction time-budget issue caused by
network latency.

**Fix.** Restructured into three phases without one long-lived tx:
(A) session-scoped `pg_try_advisory_lock(817293744)` replacing the
old `pg_try_advisory_xact_lock`, released in a `finally` block;
(B) un-wrapped prep — portal upsert, existing-rows query, vendor/
client resolve loops; (C) per-row mini transaction wrapping the
`job.upsert` + its `logActivity` (~2–3 statements each, well under
any timeout). Summary `REQUISITIONS_IMPORTED` audit is a single
un-wrapped insert after the loop. Removed `{ timeout: 60_000 }`.
Trade-off: lose cross-row atomicity — a crash mid-import leaves
earlier rows committed. That's actually better for a 300+ row
bulk where per-row errors are already collected; partial success
beats "redo the whole batch."

**Lesson.** When a long-running transaction fails inside a
helper, the helper is almost never the problem — look at the
transaction's *shape* (count and latency of round-trips), not the
last statement it tried. And: cross-row atomicity in a bulk import
is rarely worth the time-budget cliff it creates. Prefer per-unit
mini transactions with a separate concurrency lock at the bulk
grain.

---

## 2026-05-28 · Data-driven gap closure on iLabor JSON

**Situation.** Pre-demo review of the iLabor adapter. Admin said
"check if you have any fields we're not accounting for." First pass
just diffed the JSON keys against the Prisma Job columns: found 8
uncaptured fields, suggested capturing the three "obvious" ones
(`submitLimit`, `submitStatus`, `questionStatus`) as raw ints.

**Diagnosis.** Before designing the UI, ran a fill-rate scan over
all 306 rows (`python3` one-liner counting non-empty values per
field). Three things flipped:
1. `submitStatus` was uniformly described as an opaque code, but
   the data showed only two values: 0 (52 rows) and 1 (254 rows).
   That's a binary "accepting submissions" flag, not opaque.
2. `questionStatus` was assumed always-0, but 33 rows (11%) had
   value 3 — a real screening-required signal worth surfacing.
3. `submitLimit` was uniformly 30. Capturing it makes sense for
   future-proofing but the cap-warning flow has low *current*
   value (every req shares the same cap).

Also noticed `accountManager`, `alternateEmail`, `createdBy` were
captured but always empty (0 / 306), and `department` was always
"Default" — pure noise on the UI.

**Fix.** Rewrote the plan around the actual data. `submitStatus`
became `ilaborSubmitOpen` with explicit 0/1 semantics + a red
"Submissions closed at iLabor" pill. `questionStatus` became
`ilaborScreenerCode` with an amber "Screening required" badge.
Hid the "Department" row when value === "Default". One small
migration, focused UI changes that the demo data would actually
exercise.

**Lesson / interview framing.** *Look at the data before you
design the schema.* A schema-only review would have shipped a
"Workflow code" forensic field nobody wanted; the data showed
two real product behaviours hiding inside a "raw" int. The cost
of the fill-rate scan was 60 seconds. The cost of guessing wrong
would have been a worthless badge on the demo.

---

## 2026-05-28 · Scenario walk-through caught a placement state-machine bug

**Situation.** After shipping R4.2 (auto-create Placement on
JOINED, terminate on revert-from-JOINED), I asked: *if a recruiter
accidentally flips a submission JOINED → REJECTED and then back to
JOINED, what happens?*

**Diagnosis.** Traced the code:
- JOINED → REJECTED hits `terminatePlacementOnRevert` → placement
  flips TERMINATED, candidate flips AVAILABLE. ✓
- REJECTED → JOINED hits `ensurePlacementOnJoined` → tries to
  `tx.placement.create` with `submissionId @unique` → hits P2002 →
  the code path's catch-and-no-op fires.
- Net result: candidate is flipped *back* to PLACED (the helper
  bumps `Candidate.status` BEFORE the placement insert), but the
  placement stays TERMINATED. **PLACED candidate with zero ACTIVE
  placements** — inconsistent state.

**Fix.** Changed `ensurePlacementOnJoined` to `findUnique` first.
If a TERMINATED/ENDED placement exists, *reactivate* it
(status → ACTIVE, clear endReason/endNote/endDate) and log
`PLACEMENT_UPDATED note="reactivated"`. Only fall through to
`create` when no row exists. P2002 catch retained for the genuine
two-tabs-race case.

**Lesson / interview framing.** *State machines need round-trip
tests, not just forward tests.* The original implementation was
correct for every forward transition; the bug only showed up when
you ran the state machine backwards-then-forwards. I caught this
by mentally simulating real recruiter mistakes ("oops, wrong
button"), not by running the test suite. Now I deliberately think
through every transition in both directions.

---

## 2026-05-28 · Re-import silent-corruption risk hunt

**Situation.** User asked: "If we import tomorrow, what happens to
our submissions and placements?" Initial answer was "they're safe"
— same `requisitionId` upserts the same Job row, no duplicates,
work stays attached.

**Diagnosis.** That answer was true for the happy path but didn't
hold up to scenario pressure. Walked through 8 failure modes:
1. iLabor changes a `requisitionId` (rare, orphan risk).
2. iLabor *re-uses* a `requisitionId` for a different role (very
   rare but silently overwrites Job metadata while keeping
   submissions attached — actual data corruption).
3. Vendor/Client renamed in iLabor → creates new row, orphans
   everything pointing at the old one.
4. Req deleted on iLabor's side → LuminTrack Job lives forever
   with stale data, no signal.
5. Duplicate `requisitionId` within a single file (concatenated
   captures) → second silently overwrites first.
6. `externalActiveCount` is a snapshot — locally created subs
   between imports aren't reflected, breaks cap warning display.
7. `c2crate` unit ($/hr vs $/day) — silent overwrite if unit
   ever changes.
8. Race during re-import — recruiter mid-submit while vendor gets
   re-linked.

**Fix.** Ranked by demo-day risk. Shipped 4 high-impact guards in
one commit:
- **Intra-batch dedup** (#5) — `validateRows` skips duplicate
  Req IDs and emits per-row warnings.
- **Effective active count** (#6) — job detail shows
  `max(externalActiveCount, local non-terminal subs)` with an
  inline note when they diverge.
- **Stale-jobs signal** (#4) — new `listStaleIlaborJobs` query;
  `/jobs/imports` surfaces OPEN iLabor jobs whose `lastImportedAt`
  predates the latest import run.
- **Case-insensitive Vendor/Client match** (#3) — `findFirst({
  mode: "insensitive" })` → create-if-missing replaces the exact-
  name upsert. Preview also lists net-new vendor/client names so
  a true rename ("RANDSTAD" → "Randstad Technologies") is visible
  before commit.
The drift detection for scenario #2 (title/client overwrite) was
shipped one commit earlier (preview badges + `JOB_UPDATED` audit
with a unified diff). Medium/low items (rate-unit, title cleanup
noise, mid-flight screener change, race) moved to
`ENHANCEMENTS.md`.

**Lesson / interview framing.** *Walk through the failure modes
of a feature, not just the happy path.* Once you've earned the
user's trust by shipping a feature, the way you lose it is by
having an edge case eat their data silently. Every guard cost
~20 lines of code; the impact is "no recruiter discovers next
quarter that their submissions are attached to the wrong job."
This is also a good story for "how do you prioritise"? — ranking
by demo-day risk × time-to-fix, not by intellectual interest.

---

## 2026-05-28 · Streaming Excel & ExcelJS WorksheetWriter quirks

**Situation.** Plan called for streaming the Excel export so a
50k-row workbook doesn't OOM on Vercel's serverless. Switched
`buildBusinessExcel` from `wb.xlsx.writeBuffer()` (in-memory) to
`ExcelJS.stream.xlsx.WorkbookWriter` piped through a `PassThrough`.

**Diagnosis.** Two iterations to land cleanly:
1. First build error: `WorkbookWriter`'s `stream` option is typed
   `Stream`, not `WritableStream` — TS rejected `NodeJS.WritableStream`.
   Fixed by typing the parameter as the concrete `PassThrough`.
2. First runtime error (caught in dev): `Cannot set property views
   of #<WorksheetWriter> which has only a getter`. The streaming
   `WorksheetWriter` exposes `views` as a read-only getter; the
   in-memory `Worksheet` allowed assignment. Documentation didn't
   call this out; only the stack trace did.

**Fix.** Pass `views` via the `addWorksheet(name, opts)` options
bag instead of `ws.views = ...`. One-line change once the cause
was clear.

**Lesson / interview framing.** *When a library has two APIs for
the same job (in-memory vs streaming), assume they're not 1:1
compatible until proven otherwise.* I'd assumed `WorkbookWriter`
was a drop-in replacement for `Workbook`. Reading the dev-server
stack trace (not the build error) was the unlock — the build was
green, but the runtime told me the property was getter-only.
Lesson reinforced: *always test the streaming path in dev before
shipping, even if the build passes.*

---

## 2026-05-28 · "Restore-grade" backup vs actual restore

**Situation.** R4.3 shipped a full-DB JSON dump via
`/api/export/full` and labelled it "restore-grade" in the code
comments and audit notes. After the demo I realised: there was
no restore script. The label was aspirational.

**Diagnosis.** A restore-grade dump is only restore-grade if you
can actually use it to restore. The JSON had every table including
User (with `passwordHash` stripped — defensible, but it means
users can't log in post-restore until passwords are reset). FK
order matters; trying to insert Submissions before Candidates
would fail.

**Fix.** Wrote `prisma/restore-from-backup.ts`:
- Dry-run by default; `--confirm` required to actually wipe + restore.
- FK-safe insert order (parents before children, reverse for wipe).
- Users get a placeholder bcrypt-shaped hash + `isActive=false`
  — login impossible until an admin triggers a reset or re-seeds.
- Chunked `createMany` so 50k-row tables don't blow the driver
  payload limit.

**Lesson / interview framing.** *Labels you put on your own work
become technical debt the moment they aren't true.* Calling the
dump "restore-grade" without writing the restore tool wasn't
quite a lie, but it created a future-me trap: in a real disaster
I'd have opened the JSON and had to write the restore script
under pressure. Now the script is the contract that backs the
label. Good story for "how do you think about technical
debt?" — the worst debt isn't bad code, it's promises in comments
that aren't true.

---

## 2026-05-28 · Pattern reuse over invention (needsConfirm)

**Situation.** Adding two new "soft warning" flows on submission
creation — one for iLabor closing the req for subs, one for the
cap being reached. Both needed an "override with a reason"
mechanism.

**Diagnosis.** A natural first instinct: invent new `FormState`
shapes for each (`{ ilaborClosed: true, ... }`,
`{ capReached: true, cap, active }`). That would mean three
duplicate prompt components on the client, three separate audit
note paths, and three sets of validation rules.

**Fix.** Reused the existing duplicate-submission
`needsConfirm: true` pattern. Added two new `kind`s to the
internal `CreateResult` union (`ilabor_closed`, `ilabor_cap`).
Server returns the same `{ needsConfirm, error }` shape; only
the error string differs. Client form sniffs whether
`error.startsWith("iLabor")` to know which `name` to give the
textarea (`ilaborOverrideReason` vs `duplicateReason`).
`CANDIDATE_SUBMITTED` audit `note` composes from up to two
override reasons, joined by `; `.

Net new code: ~30 lines server, ~10 lines client. The duplicate
flow's component didn't change shape.

**Lesson / interview framing.** *Look for the pattern before
designing a new one.* The rule of three says you extract on the
third occurrence, but if there's already a working pattern from
occurrence one, you don't re-invent on occurrence two — you
extend. This is the practical version of DRY: not "never repeat
yourself" but "extend the existing shape unless it's actively
fighting you."

---

## 2026-05-28 · Sub-team dev-environment hygiene (port 3000 orphan)

**Situation.** After a `/compact`, dev kept 500ing with
`ENOENT: .next/dev/server/pages-manifest.json`. Tried
`rm -rf .next && npm run dev` multiple times — each time the
dev server announced `Port 3000 is in use by process 30246,
using available port 3001 instead.`

**Diagnosis.** `lsof -iTCP:3000 -sTCP:LISTEN -P` showed PID
30246 was a `bun` process — unrelated app I'd forgotten about,
squatting on port 3000. Next was falling back to 3001 *and*
trying to share the same `.next/dev` cache with its previous
incarnation. The manifest writes were racing.

**Fix.** Killed the orphan + the stale next-dev process in one
command, confirmed port 3000 was free, restarted dev. No code
change; just process hygiene.

**Lesson / interview framing.** *Before debugging code, debug
your environment.* I had spent two iterations assuming the
streaming-export changes had broken something. The stack trace
mentioned `pages-manifest.json` — a file Next generates, not one
I wrote. That was the signal that the problem was below the
application. Practical tools: `lsof -i:PORT`, `ps -ef | grep`,
and never trust "port in use, falling back" — that's the dev
server telling you something is wrong.

---

## 2026-05-28 · Hydration warning on `<tr>` in `<table>`

**Situation.** `/reports` started throwing a React hydration
warning: `In HTML, <tr> cannot be a child of <table>. Add a
<tbody>, <thead> or <tfoot>`. The page rendered fine but the
console was loud.

**Diagnosis.** Server-side `CollapsibleTable` was being passed a
bare `<tr>` as the `head` prop. The browser's parser auto-inserts
`<tbody>` around stray `<tr>`s in a `<table>`, but React's
hydration step compares the server HTML to the parser's "correct"
DOM, sees the inserted `<tbody>`, and warns about the mismatch.

**Fix considered:** wrap every caller's `head={<tr>...</tr>}` in
`<thead>{...}</thead>`. ~8 callsites. Tedious and easy to forget.

**Fix shipped:** one line — `CollapsibleTable` itself wraps
`head` in `<thead>{head}</thead>`. All callers continue passing
a bare `<tr>` and the primitive does the right thing.

**Lesson / interview framing.** *Fix at the primitive, not the
callsites — when it's possible.* The bug was a contract issue
between the `CollapsibleTable` primitive and HTML's table grammar.
The right place to enforce the contract is the primitive, not
every caller. The wrong fix scales linearly with usage; the right
fix is `O(1)` and the rule is encoded in one place.

---

## 2026-05-28 · Re-imports were silently overwriting work — fix at the diff, not the schema

**Situation.** Recruiters were nervous about re-uploading the iLabor
JSON. The fear: "I edited a job last week — what happens to my work
on the next import?" The honest answer was uncomfortable: every
iLabor-mapped column was overwritten unconditionally on every
re-import, and only `title` / `client` / `vendor` drift was logged.
Rate / end-date / positions / owner — silently clobbered.

**Diagnosis.** Two separable issues. (1) **Unnecessary writes** —
the importer reissued the same `job.upsert` even when iLabor's payload
matched what we already had. Wasted writes, bumped `updatedAt` for
nothing. (2) **Opaque writes** — when something *did* change, the
operator had no trail of what. The temptation was to add a
`manualOverride` flag column per field (heavy schema change; hard to
get right). The simpler reframe: *don't prevent overwrites — make
them transparent.*

**Fix.** Per row, compute `diffJobFields(prior, next)` against an
expanded `select` over all 21 iLabor-owned columns (date-safe via
`Date.getTime()`; decimal-safe via `Number(x.toString()).toFixed(2)`).
Three branches: no diff → bump `lastImportedAt` only and increment
`unchangedCount`; diff → write only changed fields + one
`JOB_UPDATED` audit row whose `description` lists every old → new
pair. To make the per-row audits discoverable, pre-create the
`REQUISITIONS_IMPORTED` summary row *before* the loop so its id
exists; stamp every per-row audit with
`note = "importRunId:<id>"`. Free correlation key, zero schema
change. UI surfaces: 5-card preview summary (Unchanged added);
`/jobs/imports/[activityId]` drill-down listing every changed job
with its diff bullets; `/api/jobs/imports/[id]/changelog?format=txt|csv`
download (admin-only, logs `DATA_EXPORTED`). `/audit` page extracts
`importRunId:` from `Activity.note` to render a linkback.

**Lesson.** *Don't prevent the bad thing — make it visible.* A flag
column per field would have been weeks of work and a maintenance
trap. A diff helper + a free correlation key in an existing
nullable column gave us prevention's downstream benefit (operator
trust) at a fraction of the cost. The schema isn't always the right
place to encode policy; audit log + good UX often is. Also:
**preview parity matters.** Shipping the diff path on commit but
leaving preview showing the old binary "Updated" was the moment
operators noticed — "I see Unchanged after confirm but not in
preview." If a feature is about transparency, it has to be
transparent at every step.

---

## 2026-05-28 · Sources and Portals diverged — generic mirror beat the special case

**Situation.** Recruiter asked: "I'm importing from Randstad iLabor —
why isn't Randstad listed as a Source under Settings → Sources?"
LuminTrack has two models that look similar but mean different
things: `JobPortal` (the system data flowed *in* from) and
`SisterCompanySource` (the recruiter-attributed origin used for
reporting on `/reports`). The importer touched `JobPortal` but never
set `Job.sisterCompanySourceId`, so iLabor jobs showed up as "—" in
source breakdowns.

**Diagnosis.** The first instinct — hardcode an upsert of a
`SisterCompanySource` named "Randstad" inside the iLabor importer —
fails the "what about the next portal?" test. CWS, Beeline, future
VMS integrations would all need their own special case. The right
shape was a **convention**, not a code path: every JobPortal gets a
mirrored Source with the same name. One helper, called next to every
JobPortal upsert.

**Fix.** `src/server/portals.ts` ships `ensureSourceForPortal(db,
portalName)` — case-stable upsert on `SisterCompanySource.name`,
returns the id. Called from `seed.ts` (after the iLabor JobPortal
upsert) and from the importer's Phase B.1 (after `prisma.jobPortal.
upsert`). Set on the **create** path only of `job.upsert` so admin
re-tags survive re-imports. A one-shot `prisma/backfill-portal-
sources.ts` iterates every existing JobPortal, ensures its mirror,
and `updateMany`s the dangling 305 jobs. Preview UI gained a Source
banner — slate "(existing)" or amber "(will be created)" — so the
admin sees which Source the run will attribute to *before*
confirming.

**Lesson.** *Convention beats special case when the model is going
to grow.* The hardcoded "Randstad" branch would have looked fine
in review and silently rotted with every new portal. A two-line
helper called from the canonical upsert site encodes the rule
once and pays forward indefinitely. Also: **show the attribution
in preview.** Mutations that decide invisible things make
operators distrust the system. Show the decision before the
commit button.

---

## Recommended use

- **Before an interview:** scan the entries' titles and pick 2–3
  whose lessons match the role (data work → entries 1, 3; system
  design → 2, 4, 6; team practices → 5, 7; debugging → 3, 7, 8).
- **When prepping STAR answers:** the four-line format (S / D / F /
  L) is already most of a STAR answer. Just expand the "L" into
  "Result + what I'd do differently."
- **When the next non-trivial problem hits:** add an entry here
  while the diagnosis is fresh. Future-you won't remember why a
  one-line fix took two days to find.
