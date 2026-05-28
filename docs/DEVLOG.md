# LuminTrack DEVLOG — issues, diagnoses, fixes, lessons

Running record of non-trivial problems encountered during build and
how we solved them. Each entry is a self-contained interview story:
**Situation → Diagnosis → Fix → Lesson**.

The goal is to remember the *thought process*, not just the diff —
so each entry calls out the engineering principle that made the fix
short instead of long.

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
