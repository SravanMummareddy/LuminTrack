# LuminTrack DEVLOG — issues, diagnoses, fixes, lessons

Running record of non-trivial problems encountered during build and
how we solved them. Each entry is a self-contained interview story:
**Situation → Diagnosis → Fix → Lesson**.

The goal is to remember the *thought process*, not just the diff —
so each entry calls out the engineering principle that made the fix
short instead of long.

---

## 2026-07-11 · Wave 1a access tiers — and two report pages that were never guarded

**Situation.** Owner wants recruiters **and team leads** restricted to the operational surface
(no Dashboard analytics, Reports, Settings, financials); Managers keep everything. While mapping
the enforcement surface for the nav restriction, the real find was that `/reports` and
`/recruiters` (org-wide analytics + every recruiter's performance detail) had **no role guard at
all** — `reports/page.tsx` didn't even call `requireUser`. Any signed-in recruiter could load
them by URL; only the *nav link* implied they were privileged.

**Diagnosis.** The codebase had exactly one privileged-tier predicate, `hasFullAccess` =
`MANAGER || TEAM_LEAD`, used for ~26 call sites. But the owner's new boundary puts **TEAM_LEAD on
the restricted side** for nav/financials — so `hasFullAccess` is the *wrong* predicate to reuse
here: extending it would still let team leads see Reports/Settings. Two boundaries now exist that
were previously one: **management authority** (VPR, still Mgr+TL) vs **nav/financial tier**
(Manager-only). Conflating them was the trap.

**Fix.** Added a *narrower* `isManagerTier` (`role === "MANAGER"`) alongside `hasFullAccess`
rather than changing it; repointed the Settings-only powers (`canManageOrgEntities`,
`canManageUsers`) to it; added `<Forbidden>` guards to the two unguarded pages (+ `/recruiters/[id]`);
tightened `/settings`, `/audit`, `/settings/export` from `hasFullAccess` → `isManagerTier`. Nav
filters by tier; the dashboard reused the existing `?scope=me|org` seam (non-managers locked to
`scope=me`); quick-add got its own `canQuickAddOrgEntities` (any signed-in). Restricted `/settings`
collapses to the My-account tab so password change still works. Per-record rate-column masking
deferred (owner decision D13: hide pay vs bill vs margin). tsc clean, **193 tests** (was 178),
browser-verified all three tiers.

**Lesson.** "Restrict the nav" is a UI job; "restrict access" is a route-guard job — and hiding a
nav link is security theater if the page underneath is unguarded. The audit that matters isn't
"what's in the sidebar" but "which `page.tsx` files call a role predicate" — that's how the two
never-guarded report pages surfaced. And when a role boundary *splits*, add a new predicate; don't
widen the old one, or you silently regrant the very tier you meant to restrict.

---

## 2026-07-10 · Removed the iLabor / Randstad requisition-import feature entirely

**Situation.** The owner decided jobs will only ever be added manually and asked to
"take out everything related to iLabor." iLabor was a whole sub-build: a browser-extension
→ JSON → admin-upload pipeline that created/updated Jobs, plus a `JobPortal` table, ~14
iLabor-only Job columns, two soft submission gates (`ilabor_closed` / `ilabor_cap`), source
sub-tabs, an import wizard + history pages, and a "disappeared-from-iLabor" stale-job scan.

**Diagnosis.** The coupling spanned ~40 files across every layer, but it split cleanly into
three buckets: (a) **delete-entirely** — the import action, `portals.ts`, the two validation/
format libs, the `/jobs/import` + `/jobs/imports` routes, the wizard component, the changelog
API; (b) **surgical** — the gate machinery (which is *shared* with the duplicate/rate/bench
gates, so the iLabor branches had to be excised without touching the rest), jobs queries/list/
detail/table, and `formatJobDisplayId` (dropped its `REQ-` portalRef branch → always `JOB-`);
(c) **schema** — drop `JobPortal` + the iLabor columns. The one trap: the "More job details"
fields (`positions`, dates, `reqType`, `department`, `atsId`, `durationLabel`) were added *for*
iLabor but are generic — the owner chose to keep them, so those columns stay and only the
import-signal columns drop.

**Fix.** Migration `20260710170000_remove_ilabor` drops the FK/unique/index, the 14 iLabor
columns, and the `JobPortal` table (kept the two `ActivityAction` enum values — dropping a
Postgres enum value needs a type-recreate and historical audit rows reference them). Code:
removed the gate types from `form-state`, `submission-create`, `submission-gates`, and both
submit actions; deleted the source-tabs component; simplified the jobs list/detail/table;
reseeded dev (50 manual jobs, no portal). `tsc` clean, **178 unit tests pass**, production
build green (`/jobs/import*` gone from the route table). **Prod migration + reseed deliberately
NOT run** — flagged for owner go-ahead.

**Lesson.** When ripping out a feature whose gate logic is *woven into shared machinery*, the
win is a clean seam: because every submission gate already funneled through one
`collectSubmissionGates` + a `PendingGateKind` union, removing iLabor was "delete two union
members and their branches" rather than untangling conditionals scattered across the submit
paths. The same shared-seam discipline that made the gates testable made them removable.

---

## 2026-07-10 · Whole-codebase review — two Criticals: a dead RBAC literal and a lossy "restore-grade" backup

**Situation.** A deep review of the whole codebase (6 parallel domain reviewers) surfaced
two Critical findings that both hid behind code that *looked* correct.

**Diagnosis.**
1. **Dead RBAC gate (silent data loss).** `canEditRates` in `placements.ts` returned
   `userRole === "ADMIN" || userId === submittedById`. But `ADMIN` was retired from the
   `UserRole` enum (now `MANAGER | TEAM_LEAD | RECRUITER`), so the first clause is *always
   false*. The placement detail page still renders rate fields as editable to any
   `hasFullAccess` user, so a manager/team-lead edited bill/pay/client rates, hit Save, and
   the action silently discarded them — a broken gate AND silent loss of commercial data for
   the exact users meant to own it. Grep confirmed this was the last live `"ADMIN"` string in
   `src/` outside a comment — a retirement that missed one call site.
2. **Backup drops 4 tables + FK-violates on restore.** `build-backup-json.ts` (the
   "restore-grade" dump) omitted `SupportProvider`, `LookupOption`, `GlossaryNote`,
   `CustomGlossaryTerm`. Beyond silent data loss, `InterviewRound.supportProviderId` is a
   real FK and interview rounds *are* re-inserted on restore — so a backup taken after any
   round was linked to a provider would blow up mid-restore with an FK violation, pointing at
   a provider row that was never restored. The `SupportProvider` table (migration
   `20260710160000`) shipped after the backup code and nobody circled back to add it.

**Fix.**
1. `canEditRates` now calls the shared `hasFullAccess({ role })` helper (typed `UserRole`)
   instead of the dead literal — one line, routing through the single source of RBAC truth.
2. Added all four tables to the backup dump + preflight counts and to `INSERT_ORDER`/
   `WIPE_ORDER` in FK-safe positions (`supportProvider`/`lookupOption` before `interviewRound`;
   glossary tables after `user`). Bumped backup `version` 1→2; restore accepts both (v1's
   missing keys fall back to `[]`). `tsc` clean, 179 tests pass; export UI unchanged (`totals`
   is a generic `Record<string, number>` consumed via a lookup map with `?? 0`).

**Lesson.** Both bugs are "retirement/addition left one edge unfinished" — a dropped enum
value and a new table. The durable defenses are structural: (a) never inline a role string,
always funnel through `hasFullAccess` so retiring a role is a one-file change *and* a compile
error at stragglers; and (b) a "restore-grade" claim needs a test that round-trips every model
(a `Object.keys(prisma)` vs. `INSERT_ORDER` diff would have caught the four missing tables at
CI, not in a disaster).

---

## 2026-07-10 · Interview "support" wouldn't save — a stale Prisma client, not a form bug

**Situation.** The owner reported the interview "support" fields weren't saving, and
asked whether the support they were seeing had been auto-populated. Two questions in one:
is the data real, and why won't a new value persist?

**Diagnosis.** The "auto-populated" half is true by design — the demo seed
(`prisma/seed-demo.ts:1389`) sets `supportNeeded` on ~30% of rounds and names a provider
on ~70% of those (dev: 28 of 90 rounds, 16 with a provider). The "won't save" half was not
a form bug at all: the submission detail page was *crashing*. The dev-server log showed
`TypeError: Cannot read properties of undefined (reading 'findMany') at
listSupportProviderOptions` — `prisma.supportProvider` was `undefined` because the
long-running `npm run dev` still held a Prisma client generated *before* the
support-providers migration. The whole `SubmissionDetailPage` threw (caught by the error
boundary → "Something went wrong"), so the interview-rounds card — support fields included —
never rendered a working save path. The schema, Zod validation, action, read query, and the
*on-disk* generated client were all correct (a fresh tsx probe read `supportProvider` fine,
5 rows); only the in-memory process was stale.

**Fix.** Restart the dev server. Confirmed end-to-end after the restart: the page returns
200, and editing a no-support round to add a provider + method persisted to the DB
(`supportNeeded:true`, provider "Wei Chen", method saved), then reverted to keep dev
pristine. No code change. Production (Vercel) was never affected — each deploy runs
`prisma generate` during the build, so prod's client always has the model.

**Lesson.** `Cannot read properties of undefined (reading 'findMany')` on a `prisma.<model>`
call almost always means the running process predates a `prisma generate`, not a missing
model — HMR does not reload the regenerated client (already called out in CLAUDE.md's
migration workflow). Before debugging the form, check whether the *page itself* is throwing:
one glance at the dev-server log named the culprit and turned a "save bug" into a restart.

---

## 2026-07-09 · "Mark joined" looked frozen — a dialog that closed before the work finished

**Situation.** The owner clicked "Mark joined" and the button greyed out with no
feedback; the page looked frozen and only a reload "fixed" it. Was it a hang, or a bug?

**Diagnosis.** Not a hang. `confirmDialog()` called `setDialog(null)` *before*
dispatching the action, so the dialog vanished instantly and all that was left on
screen was the underlying primary button in its `disabled={isPending}` state — greyed,
no spinner, no "Saving…". Every other action button (primary advance, the "Jump to any
stage" Update) already showed a pending label; the four *dialog* confirm buttons were
the only ones that didn't. The JOINED path is also the slowest (it creates a placement
+ flips the candidate + rolls the bench), so the dead interval was most visible there.
The theorised "silent placement race" (P2002 → null) is benign: a placement *does*
exist (the concurrent write made it), and inside a Postgres transaction a caught
constraint violation can't silently half-commit — so no data fix was needed.

**Fix.** Keep the dialog open through the action: `confirmDialog()` sets a
`submittedFromDialog` ref instead of closing, the confirm/cancel buttons take
`disabled={isPending}` + a busy label ("Marking…" / "Saving…"), and one
`useEffect([isPending])` closes the dialog when the action settles — success (toast +
reset) or error (reveals the banner). One ref + one effect, no action/DB change.

**Lesson.** "Greyed out with no feedback" is a *missing pending state*, not a stuck
process — before suspecting the server, check whether the control that should show
progress is the one on screen. Closing a modal on submit hides the very busy state that
tells the user it's working; close it on *settle* instead.

---

## 2026-07-08 · Audit log "semi information" — a dropped SELECT, not missing data

**Situation.** The owner looked at the org-wide Audit log and noticed rows were
"semi information": interview and bench rows had a blank "—" Entity, and even the
linked ones only said a generic "Job ↗" / "Candidate ↗" — you couldn't tell *whose*
"Final Round" or *which* job without clicking through.

**Diagnosis.** Two things. (1) A real bug: the audit query selected only four of the
six entity FKs — it dropped `interviewRoundId` and `benchConsultantId`. Those rows
*had* the link data; the query just never read it, so `linkFor` returned null → "—".
(2) A design gap: the Entity column showed the record's *type* word, not its *name*,
because the description (composed at write time) carries the "what changed" (round
name, from→to) but never the "who/which" (candidate, job title).

**Fix.** Resolve the *subject* at read time instead of rewriting ~100 logActivity
call sites. Select the two missing FKs plus lightweight name relations
(submission→candidate+job, interviewRound→submission→candidate, bench→consultant,
job/candidate/requirement), and render a single "Subject" column that names the
record and links it — "Andre Brown — .NET Developer ↗", "Requirement — .NET Developer
↗", the bench consultant's name for a bench row. Removed records keep their name via
`deletedSuffix()`. Description stays the "what"; Subject carries the "who/which".

**Lesson.** "Missing information" in a UI is often present in the row but dropped by
a narrow `select`. Check the query before adding new columns or writes. And keep the
audit split clean: description = what changed (snapshot), a resolved subject column =
who/which (always current) — don't bake names into the description string.

## 2026-07-09 · Submission warnings fired one-by-one — stack them into one review

**Situation.** Submitting a candidate that tripped several soft gates (Do-not-contact
+ off-bench + duplicate) forced the recruiter through them one at a time: submit →
warning → reason → submit → next warning → reason → submit. One submission's audit
note captured three override reasons — proof the recruiter had made three round-trips.

**Diagnosis.** Each action evaluated gates in sequence and `return`ed at the FIRST
failure, so the form could only ever show one warning at a time. The gates were also
scattered — some in the action, some inside `createSubmissionRecord` under the advisory
lock — so nothing knew the full set at once.

**Fix.** A pure `collectSubmissionGates()` helper the caller feeds all the loaded data
(candidate/bench status, rate chain, convert warnings, a pre-checked duplicate + iLabor
counts) and every supplied reason; it returns the FULL list of gates still missing a
reason. The action returns them under `pendingGates`, and the form renders one "Review
before submitting (N)" panel — a block + reason field per gate — cleared by a single
"Submit anyway". The create still re-checks dup/iLabor under the lock as the race-safe
net; a gate that slips in there comes back stacked the same way. Each reason posts via
its own latched hidden input, so the whole batch submits in one POST.

**Lesson.** "One prompt per problem" is a first-failure-return smell. When several
independent confirmations can all apply, collect them in one pass and present them
together — the user resolves the set once instead of discovering them serially. Keep
the collector pure so the ordering/aux-data is unit-testable, and keep the
in-transaction check as the race-safe backstop rather than the primary gate.

## 2026-07-08 · "Only bench candidates get submitted" — a soft gate, not a hard rule

**Situation.** The owner asked: since we submit bench consultants to requirements,
should we enforce that only bench candidates can be submitted — a condition before
the submit? And add a "Submit to a requirement" button on the bench page.

**Diagnosis.** Submissions link to the **Candidate**, not the bench row, and
`createCandidate` already auto-adds every AVAILABLE candidate to the bench — so
"only bench candidates get submitted" is *already ~true by default*. A hard gate
would re-couple the axes we'd just spent three rounds decoupling (candidate status
≠ placement ≠ bench ≠ working) and create busywork for the legitimate exceptions
(re-engaging an off-bench consultant, a placed backfill). The genuinely useful
signal isn't "on the bench" (almost always yes) but "not being *actively* marketed"
(Off bench / no row).

**Fix.** Three complementary moves, no hard block: (1) a "Submit to a requirement"
button on the bench + candidate pages that carries the candidate through the VPR
list (banner + per-row "Submit here →") into the convert form, preselected; (2) a
soft, dismissible `not_marketing` gate — fires only for an Off-bench/no-row
candidate, overridable with a reason, exactly like the existing candidate_status
gate; (3) since **a submission IS an act of marketing**, `createSubmissionRecord`
now reactivates an Off-bench row (or creates a missing one) on submit — keeping the
bench honest by construction. PLACED/PAUSED are left alone so the manual
"Market — project ending" decision still owns the placed-and-marketed case.

**Lesson.** When a rule is "almost always already true," a hard gate mostly
generates friction for the exceptions. Prefer a soft warn on the *surprising* case
plus a side-effect that keeps the invariant true (reactivate-on-submit) over a
block that forbids the legitimate ones.

## 2026-07-08 · A mouse-picked autocomplete option never marked the form "dirty"

**Situation.** The bench/candidate forms have an unsaved-changes guard: a
`<form onInput={markDirty}>` arms a `beforeunload` prompt and a "Discard changes?"
dialog on the in-form "View candidate" link. But if you set Technology or Work
authorization *only* by clicking a dropdown suggestion (no typing), navigating away
dropped the edit silently — the guard never fired.

**Diagnosis.** `SuggestInput` committed a picked option by calling the parent
`onChange` with a **synthesized** event object (`{ target: { value } }`). React state
updated, so the value showed — but no **native** `input` event was ever dispatched,
so the ancestor `<form onInput>` (which listens for real DOM events, not React's
synthetic ones) never saw it. Typing worked only because each keystroke is a genuine
DOM input event. So the guard was blind to exactly the interaction it most needed to
catch.

**Fix.** Make a programmatic commit behave like a real keystroke: drive the value
through the native `HTMLInputElement.prototype.value` setter, then
`dispatchEvent(new Event("input", { bubbles: true }))`. That single event makes both
React's own `onChange` fire *and* the ancestor `onInput={markDirty}` see the change.
Also `preventDefault()` on the "commit a brand-new typed value" Enter path so the
form doesn't submit in the same tick before the value's follow-up state update
(append-to-Skills) lands. Verified in-browser: the dispatched event bubbles to the
`<form>` listener.

**Lesson.** React's synthetic `onChange` and the DOM's native `input` event are not
interchangeable. Anything that listens at the DOM level (`onInput` on a container,
a third-party observer, testing-library) only sees native events. When a component
sets a value programmatically, dispatch a real bubbling event via the native setter —
don't hand-roll a fake event object.

## 2026-07-08 · Bench had TWO status axes that could contradict each other

**Situation.** The owner saw a bench row labelled "Active on bench" (a checkbox)
while its pill said **Paused** — a contradiction. He asked where marketing status
is even set, and how it differs from active/inactive.

**Diagnosis.** `BenchConsultant` carried two independent lifecycle axes, both
rendered as UI: `isActive` (a boolean "Active on bench" checkbox) and
`marketingStatus` (ACTIVE/PAUSED/PLACED/INACTIVE). They were free to disagree
(isActive=true + marketingStatus=PAUSED), and the roster/detail drew *both*, so the
UI read as self-contradictory. Two axes modelling the same concept ("are we
marketing this person?") is the root cause — not a rendering bug.

**Fix.** Collapse to ONE axis. `marketingStatus` became the single source of truth
with self-explanatory labels (**On bench / Paused / Placed / Off bench**), rendered
as a single badge. Removed the "Active on bench" checkbox; the action now forces
`isActive: true` (deprecated column, never contradicts). `reconcile-bench-status.ts`
flips any legacy `isActive=false` row to `INACTIVE` so nothing is lost. Same shape
as the earlier candidate one-lifecycle-badge fix.

**Lesson.** When two fields can disagree about the same thing, delete one — don't
reconcile them at every render. One axis, self-describing labels, one badge: the
contradiction becomes unrepresentable.

## 2026-07-08 · "Working now" ≠ "Placed" — three orthogonal axes, not one

**Situation.** The owner wanted a "working now?" flag on candidates, AND a placed
consultant (project ending) to still be markable on the bench, AND a consultant
working at *another* org to be marketed here without appearing in Placements.

**Diagnosis.** These only conflict if you conflate three things. The owner's model
keeps them independent: **Placement** = an engagement that went *through us*
(revenue record); **Candidate.isWorking** = working *anywhere*, incl. external;
**bench marketingStatus** = are we marketing them. Deriving "on bench" from "has no
placement" (the old shortcut) breaks all three cases.

**Fix.** Added `Candidate.isWorking` + `workingType` (independent of Placement),
kept Placement strictly through-us, and a manual **Re-market** action puts a PLACED
consultant back on the active bench without touching the placement (placement→bench
sync only fires on placement transitions, so it won't clobber the manual ACTIVE).
Re-adding a removed consultant reactivates the retained row (no retype) instead of
erroring on the `candidateId` unique constraint. Technology + real-time experience
moved onto the Candidate (source of truth; the bench overlay reads them), mirroring
the earlier discipline move.

**Lesson.** When a user's scenarios seem contradictory, you've usually merged two
orthogonal axes. Name each axis explicitly and the "contradictions" resolve into
ordinary combinations.

## 2026-07-08 · "Job Filled but requirement Open" — the code was right, the data was wrong

**Situation.** The owner flagged a VPR detail showing status **Open** under a job
that was **Filled**, with an amber banner telling him to "reopen the job or close
this requirement." Misleading — a filled job shouldn't have an open requirement
begging for candidates.

**Diagnosis.** The instinct is "the close-job cascade is broken." It wasn't: both
`changeJobStatus` and `bulkChangeJobStatus` correctly flip OPEN VPRs to CONVERTED
(FILLED) / CANCELLED (CLOSED·CANCELLED) when a job goes terminal, and there is no
auto-fill path that bypasses them. The stale rows came entirely from **seed data**:
`seed-demo.ts` created VPRs with a hard-coded `status: "OPEN"` regardless of the
parent job's (randomly-weighted) status, and a second "extra awaiting requirements"
loop picked a *random* job — terminal ones included — and forced OPEN. The runtime
invariant was never enforced at the point the data was manufactured.

**Fix.** Two-pronged, because both existing rows and future seeds needed it:
(1) `prisma/reconcile-vpr-status.ts` — idempotent one-off that aligns OPEN VPRs
under terminal jobs to CONVERTED/CANCELLED (25 rows on the dev DB, incl. the
owner's VPR-484). (2) Seed now derives the VPR status from the job (`FILLED →
CONVERTED`, `CLOSED/CANCELLED → CANCELLED`) and scopes the "awaiting" extras to
non-terminal jobs only. Post-reseed the reconciler finds zero.

**Lesson.** When a UI shows an "impossible" state, check whether the *writer* that
produced the row ran through the same invariant the *runtime action* enforces.
Seeds and backfills are writers too — they bypass the action layer, so any
invariant that lives only in an action (not the schema) has to be re-implemented
wherever data is authored. A cheap reconcile script both fixes prod and doubles as
the test that the seed fix actually holds.

---

## 2026-07-08 · Trashed candidates leaking into pickers — a per-query invariant, forgotten once

**Situation.** A full-diff code review of the feedback-round-1 body flagged that
`listCandidateOptions()` (the lightweight candidate list behind the submission /
VPR / bench pickers) had **no `where` clause at all** — while every candidate
*list* view filters `deletedAt: null`.

**Diagnosis.** The trash/erase model hides trashed and erased rows by convention:
each query adds `deletedAt: null` itself; there is no central enforcement. That
convention held everywhere except this one picker, so a **trashed — or even
erased/anonymized ("Erased candidate #N")** — candidate showed up as a selectable
option, and neither `createSubmission` nor `convertRequirementToSubmission`
guards `deletedAt` (they only block the `NOT_INTERESTED` / `DO_NOT_CONTACT`
engagement statuses). Net effect: a deleted person could be submitted, polluting
scorecards, or re-added to the marketing bench.

**Fix.** One line — `where: { deletedAt: null }` on `listCandidateOptions`,
matching the invariant. (Same review pass parallelized the archive builder's
per-file Blob fetches and extracted the duplicated status/discipline coercion
into `filters.ts` `parseEnumList()`.)

**Lesson.** When a safety property is a *per-query convention* rather than a
schema/middleware guarantee, "grep for the one place that forgot it" is a
recurring review job. The durable fix is to lift `deletedAt: null` into a shared
query layer (a Prisma `$extends` default, opt-out for trash views) so a new query
can't silently leak trashed rows — logged as a follow-up.

---

## 2026-07-08 · "Permanent delete" that can't lose data — archive-then-scrub instead of a trash-first guard

**Situation.** Two things collided. (1) `eraseCandidateNow` — the permanent,
irreversible erase — gated on role, existence, not-already-erased, and a
type-the-name confirm, but **never required the candidate to be trashed first**,
so a forged/direct call could scrub a live, never-archived candidate. (2) The
owner disliked the "you must trash and wait 30 days" architecture: *if an admin
wants to permanently delete, they should be able to* — just without silently
losing the data.

**Diagnosis.** A "must be trashed first" server guard would close the safety
hole but fight requirement (2) — it makes permanent delete a two-step, and the
real thing protecting the data was still just a 30-day purgatory. The better
invariant isn't "delete only after trashing," it's **"never scrub without a
recoverable backup existing."** Move the safety net from a *time window* to a
*durable artifact*.

**Fix.** `hardEraseCandidate` now builds a full personal-data archive
(profile + submissions summary + résumé/document files, via the existing
`buildCandidateArchive`) and `put`s it to **private Blob** under
`archives/candidates/` *before* the transaction scrubs the row and shreds the
files. If the upload throws, the erase aborts — data intact. Both erase paths
inherit this: the admin "Delete permanently" action (now allowed directly on a
live candidate — the archive, not the trash window, is the net) and the 30-day
purge cron (whose loop now catches per-candidate so one failed backup doesn't
abort the batch). Admins review/download/"remove for good" the backups from
Settings → Deleted candidates (listed straight from the Blob prefix — the
scrubbed row keeps no queryable PII, which is the privacy-correct choice).

**Lesson.** When a safety requirement ("don't lose data") and a UX requirement
("let me delete now") seem opposed, the fix is usually to re-express the safety
requirement as an *artifact* rather than a *gate*. "Back it up first, then let
them do whatever they want" beats "make them jump through a step." And a
destructive action should enforce its precondition — here, *a backup exists* —
at the server boundary, not rely on the UI hiding the button.

---

## 2026-07-06 · Calendar rendered as one vertical column — a Tailwind class that never got generated

**Situation.** The new branded range calendar rendered its weekday header and
day grid as a single **vertical column** (Su, Mo, Tu… then 28, 29, 30, 1, 2…
all stacked) instead of a 7-wide grid. tsc, eslint, and the unit suite were all
green — this only showed in the running dev browser.

**Diagnosis.** The container was `className="grid grid-cols-7"`. The grid was
stacking in one column — the textbook symptom of `display: grid` applying while
`grid-template-columns` does **not** (a grid with no column template flows every
item into a single implicit column). Sibling classes on the same element
(`text-center`, `py-1`, `text-[11px]`) rendered fine, so Tailwind *was* scanning
the file. The tell: `grep grid-cols-7 src/` returned nothing else —
`grid-cols-7` is used **nowhere else in the app**. `grid` (used everywhere) was
in the already-built dev CSS; `grid-cols-7`, a brand-new utility, wasn't emitted
into the running server's stylesheet. So `display:grid` landed, the column
template didn't.

**Fix.** Replace the utility with an inline style —
`style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}` — so the layout
never depends on Tailwind having generated a novel class. (A full dev-server
restart would also have regenerated it, but inline is robust against the next
person adding a first-of-its-kind utility.)

**Lesson.** A green tsc/eslint/test run says nothing about whether a Tailwind
class made it into the CSS. When a *first-use-in-the-codebase* utility silently
no-ops in dev, suspect stylesheet generation, not your JSX. For structural,
must-not-fail layout (grid templates), prefer an inline style over betting on
JIT class emission.

---

## 2026-07-06 · Duplicate React key on the résumé picker — optimistic state met revalidation

**Situation.** During round-2 testing, the submission form (on the VPR-convert
path) threw a console error: `Encountered two children with the same key,
cmra2yvq40008pwze5xmjwdmi` at the résumé `<option>` map. The list visibly worked,
but React warned the same résumé id was rendered twice.

**Diagnosis.** The picker's options come from
`resumes = [...activeCandidate.resumes, ...uploadedResumes]`. `uploadedResumes`
is client state appended optimistically right after an inline
`uploadCandidateResume`. But that server action calls `revalidatePath`, so the
parent Server Component re-fetches `listCandidateOptions()` and the freshly
uploaded résumé now appears in `activeCandidate.resumes` **too** — while still
sitting in the client's `uploadedResumes`. Same id in both arrays → duplicate
key. The two sources of truth (optimistic client list + revalidated server list)
overlap for one render cycle.

**Fix.** Dedupe the merged list by id, server row first
(`submission-form.tsx`). One-line-idea fix: a `Set<string>` guard while merging,
rather than trying to clear `uploadedResumes` on revalidation (which you can't
observe cleanly from the client).

**Lesson.** Whenever you merge an **optimistic client list** with a
**revalidated server list** of the same entity, they *will* overlap for a beat —
always key the union through a dedupe, don't assume the two are disjoint.

---

## 2026-07-06 · The seed died on a bare `ErrorEvent` — right driver, wrong transport

**Situation.** After moving résumés and documents to Vercel Blob, `npx tsx
prisma/seed-demo.ts` failed immediately at "Wiping existing data…" with a
useless, message-less `ErrorEvent { type: 'error' }` — a raw WebSocket error
object, no stack, no SQL. The app itself (the running dev server) talked to the
same database fine.

**Diagnosis.** The instinct was "my Blob changes broke it," so I tested the two
things I'd touched: a minimal `SELECT 1` through the exact same adapter +
connection string **connected fine**, and adding the new `@vercel/blob` /
`blob-upload` imports to that test **still** connected fine. So it wasn't the
connection or the imports — it was the *transport under load*. The seed uses
`PrismaNeon`, the app's **serverless WebSocket** driver. A long-lived Next dev
server keeps that socket warm, but a fresh one-shot script that opens the socket
and immediately fires ~20 `deleteMany`s hits a cold Neon compute and the
WebSocket drops mid-run — surfacing as the bare `ErrorEvent`. The migrations and
integration tests never hit this because they use the **direct `pg`** adapter
over `DIRECT_URL`, not the WebSocket driver.

**Fix.** Point the seed at the same transport the other batch tools already use:
`PrismaPg` (direct TCP) over `DIRECT_URL` instead of `PrismaNeon` over the pooled
WebSocket URL. One import swap + one connection-string swap. Reseed ran clean.

**Lesson.** A message-less `ErrorEvent` is a transport failure, not a query
failure — don't debug the SQL. And match the driver to the *workload shape*:
the serverless WebSocket driver is tuned for a warm, long-lived server, not a
cold bulk script. When a script misbehaves against a serverless DB, reach for
the direct connection the migrations already trust.

---

## 2026-07-06 · The feature we "built" already existed — we'd broken it

**Situation.** Stakeholder feedback: "I add jobs manually, keep it simple, let me
track each recruiter." A first pass ("Phase 1") merged Job and Submission into a
single one-form "Jobs" list and retired the Vendor Portal Requirements (VPR) tab —
on the theory that the owner's "job" *was* a submission. Then the owner clarified
the real workflow: a team lead scopes a requirement (adds bill/pay), *then* recruiters
submit candidates against it. That's three tiers, not one.

**Diagnosis.** The owner's own spreadsheet had **two separate tabs** ("Vendor Portal
Requirements" and "Bench Submissions") with the same fields at different stages — a
staging record and a tracked record. The app's *original* design was already exactly
that: `Job → VendorRequirement → Submission`, with bill/pay living on the VPR and the
submission being the analytics-visible record. Phase 1 hadn't added a feature; it had
flattened a correct three-tier model into one and deleted the middle tier. The only
real gaps vs. the owner's ideal were narrow: the Job form carried bill/pay it shouldn't,
and the VPR→Submission convert was 1:1 when the owner wanted one requirement to receive
several candidates.

**Fix.** Revert, don't rebuild. The de-clutter work and the Phase-1 merge were
*intermingled* in two files (dashboard `page.tsx`, `queries/dashboard.ts`) and the
branch had no commits, so a hard reset would have lost the good work. Instead:
`git checkout HEAD -- <the 7 pure-Phase-1 files>` to restore originals, **surgical
edits** to the 2 mixed files (kept de-clutter, restored the VPR nudge), and parked the
3 new files. Then the two genuine refinements: trim the Job form to client-rate-only
(bill/pay moved to a collapsible, no data loss), and change VPR→Submission to 1:many
(drop `convertedSubmissionId @unique`, add `Submission.vendorRequirementId`; the VPR
stays OPEN and accumulates submissions).

**Lesson.** Before building a "new" workflow, check whether the app already models it —
a pivot request is often a request to *use* an existing structure differently, not to
replace it. And when good and bad changes are tangled on an uncommitted branch,
categorize every changed file (keep / revert / mixed) and reach for `git checkout
<file>` + surgical edits over a blanket reset. The categorization *is* the fix.

---

## 2026-06-22 · A new `Decimal` column that leaked across the RSC→Client boundary

**Situation.** After adding a `clientRate` column and shipping it, the `/submissions`
list logged a React console error on every load: *"Only plain objects can be passed to
Client Components from Server Components … Decimal"* — naming `clientRate`. The page
rendered fine, but the warning was new and pointed at the just-added field.

**Diagnosis.** `listSubmissions` uses `include: SUBMISSION_INCLUDE`, so Prisma returns
*all* scalar columns — including the new `clientRate` as a `Decimal`. The submissions
table is a Client Component, and a `Prisma.Decimal` is not a plain serialisable object.
There was already a `flattenRow` helper converting `candidateRate`/`payRate`/`billRate`
to `number` — but it predated `clientRate`, so the new column rode across un-flattened.
The other three rates were fine precisely *because* someone had remembered to add them.

**Fix.** One line: `clientRate: s.clientRate == null ? null : Number(s.clientRate)` in
`flattenRow` (`src/server/queries/submissions.ts`). Re-checked in the browser → zero leak
errors. (PR #33.)

**Lesson.** Adding a `Decimal` (or `Date`, or any non-plain) column is not a one-place
change — it silently rides every `include`/full-select query into the client. The real fix
is to make flattening total: a single `flattenRates` helper per model that a schema change
*forces* you to update, rather than N ad-hoc field lists that a new column quietly slips past.

## 2026-06-22 · A field wired into the write but not the read — clientRate dropped on convert

**Situation.** The Vendor-Portal "Move to submission" convert flow **showed and prefilled**
a Client rate, and the form submitted it — but every converted submission came out with a
blank client rate.

**Diagnosis.** Found while tracing the multi-requirement→submission flow, not from an error
(nothing threw). `convertRequirementToSubmission` parses the posted form with
`submissionSchema.safeParse({ … })`, then writes `clientRate: d.clientRate ?? null` into the
new submission. The **write** was correct, but the object handed to `safeParse` never read
`clientRate` from `formData` — so `d.clientRate` was always `undefined` → always `null`. The
direct-submit path (`readSubmission`) *did* read it; only the convert action's inline parse
object had been missed when clientRate was threaded through.

**Fix.** Add `clientRate: formData.get("clientRate") ?? ""` to the convert action's parse
input (`src/server/actions/requirements.ts`). Verified: converting a VPR with Client rate
$120 now persists $120 on the resulting submission (was blank). (PR #35.)

**Lesson.** A new field has *two* touchpoints per action — the read (formData → parsed) and
the write (parsed → DB). Wiring only the write typechecks cleanly (`d.clientRate` exists on
the schema) and fails silently at runtime. When adding a field, grep every `formData.get`
block, not just the `create`/`update` data — especially where an action hand-rolls its parse
object instead of sharing the `readX` helper.

---

## 2026-06-22 · "localhost is unable to open" — a `/` ⇄ `/login` redirect loop after a reseed

**Situation.** Right after shipping the Vendor Portal Requirements feature, the
owner started `npm run dev` and couldn't open `localhost:3000`. The server log
was a wall of identical `GET / 307` lines — dozens of them — and conspicuously
**no `/login` and no `_next` asset requests**. The browser eventually showed
"localhost is unable to open" (ERR_TOO_MANY_REDIRECTS). The dev server itself was
healthy (`Ready in 209ms`), so it wasn't a crash.

**Diagnosis.** `curl -sI /` returned `307 → /login` and `curl /login` returned
`200` — following redirects gave exactly **one** hop and no loop. So *server-side
with no cookie there is no loop*; the trap needed a cookie. Reading the two auth
layers side by side exposed the disagreement: `proxy.ts` calls
`verifySessionToken`, which **only checks the JWT signature — never the DB**,
while `getCurrentUser` does `prisma.user.findUnique` and also requires
`isActive`. The owner had just reseeded (the feature's documented "reseed" step),
which wiped + recreated every user with **new IDs**. Their browser still held a
validly-signed JWT for a *dead* user id. So: proxy sees a good JWT → "authed" →
lets `/` through and bounces `/login → /`; the page's `requireUser` hits the DB,
finds no user → bounces `/ → /login`; repeat forever. Only `GET /` showed in the
log because the browser **cached the `/login` hop** while the un-cacheable `/`
kept hitting the server — the missing `/login` lines were the clue, not noise.

**Fix.** `requireUser()` now redirects a missing-user request to a new
`GET /api/auth/logout` Route Handler that **deletes the session cookie** before
redirecting to `/login`. The cookie can only be cleared in a Route Handler (an
RSC render can't mutate cookies), and `/api/*` is excluded from the proxy matcher,
so the logout hop isn't intercepted. A cookie-less request never reaches
`requireUser` (the proxy sends it straight to `/login`), so this path fires *only*
for a stale session — exactly when clearing it is correct. Verified:
`GET /api/auth/logout → 307 /login` with `Set-Cookie: lumintrack_session=;
Expires=1970`.

**Lesson.** When two layers both gate auth, they must agree on *what
"authenticated" means* — here the edge (JWT-valid) and the page (user-exists-and-
active) diverged, and the gap only opened under a real-world event (a reseed /
user deletion) that invalidates the user without invalidating the token. The
debugging unlock was reproducing with `curl` to separate "server loops" from
"browser loops": once `curl` proved the server did **not** loop without a cookie,
the cause had to be a cookie the server trusts more than it should. And the
absence of `/login` in the log (browser cache) was the tell for which leg of the
loop was which.

---

## 2026-06-21 · "Nothing on the page is clickable" — every `/_next/static/chunks/*` 404ing

**Situation.** Mid filter-redesign, live-verifying the new Placements filter via
the browser. The page rendered fine (correct data, correct layout) but **nothing
hydrated** — selecting "Custom range" didn't reveal the date inputs, the Filters
toggle did nothing, and a DOM probe showed the `<select>` had no React fiber. My
first instinct was a bug in the new `DateRangeField` (a controlled select), but
its logic is trivial `useState` + conditional render, and tsc/eslint were clean.

**Diagnosis.** The console was full of `Failed to load resource: 404` for every
`/_next/static/chunks/*.js`, plus a repeating HMR-WebSocket handshake failure.
Server logs gave it away: `ENOENT: …/_buildManifest.js.tmp…` and `Compaction
failed: Another write batch or compaction is already active (Only a single write
operation is allowed at a time)`. **Two Turbopack dev servers were running against
the same `.next` directory** — a leftover from a `preview_start` attempt that had
errored with "Another next dev server is already running" but left a zombie still
writing to `.next`. The two processes raced on the build manifest, so the HTML
referenced chunk filenames the other process had already superseded → 404 →
no client JS → no hydration. The bug was never in the component.

**Fix.** Kill *all* dev-server PIDs (`lsof -ti:3000 | xargs kill -9`, not just the
one I knew about), `rm -rf .next` to clear the corrupted build cache, then start a
single clean server. Hydration came back. For the parts I still couldn't click
(the preview/automation path can't complete the HMR WebSocket upgrade, which
blocks Turbopack's client bootstrap), I verified server-side instead:
`?preset=custom` server-renders the From/To inputs because the field's state
initializes from the URL, and a narrowed date range dropped the row count — proving
the filter end to end without needing the browser to hydrate.

**Lesson.** When *everything* interactive is dead but the HTML is correct, suspect
the build pipeline, not the component — read the chunk 404s + server log before
touching code. Two `next dev` processes silently corrupting a shared `.next` is the
classic cause; the "Another next dev server is already running" guard only covers
the happy path, not a half-dead zombie. Also: a controlled field whose initial
state comes from the URL is verifiable server-side, which sidesteps a
broken-hydration environment entirely.

---

## 2026-06-20 · A recruiter editing a bench consultant silently wiped admin-only credentials

**Situation.** Live-testing the Bench roster as a recruiter (not admin). The
marketing-credentials block (`marketingEmail` / `marketingPassword` / numbers)
is admin-gated — correctly hidden on the detail page and omitted from the edit
form for non-admins. But when a recruiter saved *any* edit to a consultant
(e.g. changing the location), the admin-set credentials vanished.

**Diagnosis.** A classic gated-field-on-a-shared-form trap. The edit form only
renders the credential inputs when `canEditCredentials` is true, so a recruiter's
submit carries *no* credential keys. `updateBenchConsultant` was gated only by
`requireUser()` (no admin check) and wrote the full `benchData(d)` payload, where
each credential field is `d.marketingPassword ?? null`. Missing form field →
`undefined` → `?? null` → the column was overwritten with `null`. The recruiter
never saw the secrets, yet their routine edit destroyed them — and the same
no-admin-gate path would let a crafted request *set* credentials too.

**Fix.** Compute `canViewBenchCredentials(user)` inside both create and update.
When false, `stripCredentials()` *deletes* the four credential keys from the
Prisma payload entirely. Omitting a key (vs. setting `null`) makes Prisma leave
the existing column untouched on update, and fall back to the default on create.
The "marketing credentials changed" audit line is likewise only evaluated for
credential-cleared users. Verified end-to-end on a production build: recruiter
Priya edited BC-011's location → location persisted, `marketingPassword` stayed
`Secret123!`, audit logged "location" only.

**Lesson.** When a form hides fields by permission but the action writes the
whole object, "absent input" reads as "set to null" — a silent destroyer of data
the editor isn't even allowed to see. The permission boundary has to live in the
*action*, not just the form: omit gated fields from the write so they're neither
set nor blanked. Form-level hiding is UX; server-level omission is the control.

> **Testing note.** This was found only after abandoning the Turbopack *dev*
> server, which had wedged into serving error-fallback pages (`ENOENT …
> build-manifest.json`, `Cannot find module '[turbopack]_runtime.js'`) after
> repeated branch-switches + `.next` clears — symptom was "nothing hydrates,
> every client toggle dead." A `next build` + `next start` gave a stable,
> manifest-complete server where hydration worked and real bugs surfaced. When
> dev-server state looks impossibly broken site-wide with no code cause, a
> production build is both the cleaner test bed and a stronger compile check.

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

## 2026-05-29 · seed-demo crashed on wipe — delete order ignored later FK tables

**Situation.** `npx tsx prisma/seed-demo.ts` failed mid-wipe with
`Foreign key constraint violated: Placement_submissionId_fkey` (P2003) at
`prisma.submission.deleteMany()`.

**Diagnosis.** `seed-demo.ts` predates R4.2 (Placements). Its wipe block
deleted `submission` before `placement` / `placementExtension`, but a
`Placement` row holds an FK to `Submission`, so Postgres refused the delete.
`candidateDocument` (R4.1) was also never wiped. The script had silently
rotted as new models landed without anyone re-running the full wipe.

**Fix.** Added `placementExtension` → `placement` deletes before `submission`,
and `candidateDocument` before `candidateResume`, restoring FK-safe order.

**Lesson.** A destructive teardown ordered by hand is a maintenance liability —
every new model with an inbound FK must be threaded into it. When it breaks,
fix the *order*, don't reach for `CASCADE`/raw SQL: the explicit list is the
documentation of the dependency graph.

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

## 2026-06-20 · The Placements tab was empty in every demo — seed never reached JOINED

**Situation.** Adding the five Bench-Sales "Placements" sheet fields
(Organisation, Lead, Date of Interview, Date of Placement, Remarks)
was the easy part. The harder discovery: after seeding fresh demo
data, `/placements` was completely empty — `Placements: 0`. The
feature being demo'd had no rows to demo.

**Diagnosis.** `seed-demo.ts` creates 160 submissions with a random
final status drawn from age-bucketed weight tables, but **`JOINED`
only appeared in the oldest bucket (`age >= 45` days)** — and a real
data check showed only 11 of 160 submissions were that old, so the
expected JOINED count was ~2 and the actual draw was 0. Worse, the
seed never created `Placement` rows at all: placements are normally
auto-created by `ensurePlacementOnJoined` on a *live* status change
through the UI, a code path the seed bypasses entirely. So even the
rare JOINED submission left no placement behind. Two gaps stacked:
JOINED was nearly unreachable, and reaching it produced nothing.

**Fix.** (1) Added `JOINED` to the `age < 20` and `age < 45` weight
buckets and bumped its weight in the oldest bucket, lifting placements
to a realistic ~8% join rate (13 of 160). (2) Added an explicit
placement-creation block in the submission loop, fired on
`finalStatus === "JOINED"`, that writes a `Placement` with the new
sheet fields populated (org/lead/remarks on a subset, interviewDate a
few days before the start, placementDate = start), a 75/25 ACTIVE/ENDED
split, and a matching `PLACEMENT_CREATED` audit row — and flips the
candidate to `PLACED` so status stays consistent with a live placement.

**Lesson.** *A feature with no seed data is a feature you can't see —
and "the seed has a JOINED path" is not the same as "the seed produces
placements."* The status existed in the weight table and the lifecycle
helper existed in the app, but nothing connected them in the seed. When
you ship a new tab, the demo isn't done until you've *looked at the tab
with seeded data* — count the rows, don't assume the upstream weights
flow through. A one-line `Placements: ${count}` in the seed summary
would have caught this on day one.

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

---

# Historical build log (migrated from CLAUDE.md, 2026-07-10)

These round-by-round "Current work / SHIPPED" narratives lived in CLAUDE.md and
were moved here to keep the always-loaded project instructions lean. They are
preserved verbatim for reference; treat them as history, not current state.
Note: any iLabor / Randstad-import references are OBSOLETE (feature removed
2026-07-10 — see the dated entry above).

## 🚧 Current work — feedback round 3: Candidate + Bench forms & marketing lifecycle (BUILT on `main`, tsc clean, 164 tests, NOT yet committed/deployed — 2026-07-08)

Plan: `~/.claude/plans/mossy-skipping-umbrella.md`. Owner feedback from live-testing the
Add-candidate + Bench screens, built in 5 phases (all done + browser-verified on dev):
- **P1 (no schema):** candidate "Source" → **"Reference"** (label only, column stays
  `source`); `LocationInput` (existing, ~1k US cities) swapped onto the candidate + bench
  **Current location** fields (jobs/VPR already had it).
- **P2 (migration `20260708200000`):** **Candidate.technology** + **realTimeExperienceYears**
  added; **Bench.technology dropped** (bench reads the candidate's — mirrors the discipline
  move). Technology is a skills-sourced combobox (typing a new tech adds it to Skills). New
  generic **`SuggestInput`** (`src/components/ui/suggest-input.tsx`) = free-text + suggestions
  (generalizes LocationInput; unlike the strict `SearchSelect` it keeps any typed value).
- **P3 (migration `20260708210000`):** **`LookupOption`** table (category+value, learned
  values) backs work-auth / working-type / call-type / payroll-type dropdowns —
  `listLookupValues(cat)` (defaults ∪ learned, `src/lib/lookups.ts` + `src/server/queries/lookups.ts`)
  + `rememberLookup(tx,cat,val)` (`src/server/lookups.ts`). New **Candidate.isWorking +
  workingType** ("Working now?" — **independent of Placement**; Placements = through-us only).
- **P4 (no schema; `reconcile-bench-status.ts`):** **collapsed the two bench status axes into
  one** — `marketingStatus` relabeled **On bench / Paused / Placed / Off bench**, single badge;
  `isActive` retired (forced true, deprecated). Candidate detail gained a **Marketing (bench)**
  line + Add-to-bench/Market-again. **Re-market** action (`remarketConsultant`) keeps a PLACED
  consultant in BOTH placement and bench; re-adding an off-bench consultant **reactivates** the
  retained row (no retype). `bench.aVisa` auto-fills from `candidate.workAuthorization`.
- **P5:** bench "View candidate" link now dirty-guarded (`GuardedLink`); `personalNumber`
  defaults to the contact phone; **marketing credentials now visible to ALL recruiters**
  (`canViewBenchCredentials` = any signed-in user — owner decision); Back button on bench detail.

- **Round 3.1 follow-up (migration `20260708220000`):** consolidated the scattered marketing
  fields into the orange **"Marketing details"** card (renamed from "Marketing credentials",
  dropped the now-wrong "Admin only" badge, grouped marketing recruiter/start-date/experience
  with the email/password/number; personal number removed — redundant with contact phone). New
  **`BenchConsultant.relocationCities`** — when "Open to relocation" is unchecked the form
  reveals a specific-cities input; detail shows "Only to: …". `BenchCredentials` export renamed
  `BenchMarketingDetails`.

**Owner decisions (this round):** recruiters see full marketing section incl. password;
Source==Reference (relabel); collapse bench status to one axis; manual Re-market for
placed-and-ending consultants. **Deploy TODO:** commit → apply both migrations to prod
`ep-orange-dew` + run `reconcile-bench-status.ts --confirm` → reseed. Dev already migrated +
reseeded.

## ✅ CURRENT STATE — feedback rounds 1–2 SHIPPED + LIVE on prod (2026-07-08)

**`main` @ `a7062da` (PR #41), deployed to prod, tsc clean, 166 unit tests.** Repo is a
single clean branch (`main`); all feedback branches merged + deleted. **Live demo:**
`lumin-track.vercel.app` — admin `sriman@lumintrack.com` / team-lead + recruiter
`hrishikesh@lumintrack.com`, password `LuminTrack2026!`. **Two Neon DBs:** dev
`ep-billowing-mountain-at6ftznc` (active `.env`), prod `ep-orange-dew-aqe9z6f3`
(`.env.neon-prod.bak`, gitignored — the DB Vercel prod uses). Both reseeded clean
(`npx tsx prisma/seed-demo.ts`, direct `PrismaPg`/`DIRECT_URL` adapter). **Vercel does NOT
run `migrate deploy`** — apply prod migrations manually against the prod `DIRECT_URL`
(`set -a; . ./.env.neon-prod.bak; set +a; npx prisma migrate deploy`).

**The app is now a three-tier pipeline: Job → VendorRequirement (VPR, 1:many) →
Submission.** Job = bare requisition (title/client/vendor/location/status/positions +
Client rate only). VPR = team-lead-scoped commercial terms (Bill/Pay/engagement/team-lead),
`status` OPEN/CONVERTED/CANCELLED, analytics-invisible. Submission = the tracked record
(recruiter performance). Nav: **Jobs · Vendor Portal Requirements · Submissions**.

**Feedback round 1 (discipline, candidate-first bench, trash/lifecycle, Blob):**
- **IT/Non-IT `discipline`** on **Candidate + Job** (enum `Discipline`, `DISCIPLINES`/
  `DISCIPLINE_LABEL` in `labels.ts`, `DisciplineBadge` chip). Removed from BenchConsultant
  (bench reads its linked candidate's). Multi-select filters via `parseEnumList` +
  `parseList` (`src/lib/filters.ts`) on jobs/candidates/submissions/bench.
- **Candidate-first bench** — adding a bench consultant picks/creates a **Candidate**
  (source of truth); every bench person is a submittable candidate.
- **Unified trash/erase ladder (Candidates + Jobs):** Active → Inactive → Trash (30d) →
  Erased (backup-to-Blob first). `deletedAt`/`erasedAt` on both; queries filter
  `deletedAt: null`. `candidate-erase.ts` / `job-erase.ts` (+ `build-*-archive.ts`);
  purge crons. Recycle bin in Settings → "Erased backups".
- **Résumés + Documents = private Vercel Blob uploads** (Google Drive fully retired). Served
  via `/api/resumes/[id]` + `/api/documents/[id]` (auth + sensitive-doc gate). `blob-upload.ts`
  gzips before `put`. Store `store_L1XBCjldTdCtq2Ay`.
- **Date-hydration fix:** `formatDate` is UTC-deterministic (`Intl.DateTimeFormat`, tz UTC)
  to kill React #418 in list tables; `formatDateTime`/`formatTime` stay local (wall-clock).

**Feedback round 2 (this deploy — trash/erase UX, VPR consistency, VPR delete):**
- **VPR consistency:** a VPR under a terminal job is never left OPEN. The runtime cascade
  (`changeJobStatus`) was already correct; stale rows came from the seed. Seed derives VPR
  status from the job; `prisma/reconcile-vpr-status.ts` (idempotent) aligns existing rows —
  RAN on dev + prod. See DEVLOG 2026-07-08.
- **Erased records keep the real name + show "(deleted)"** (owner decision — lighter erase,
  not strict RTBF): `hardErase*` no longer scrub the name; `deletedSuffix()` (`lib/format.ts`)
  applied across submissions/placements/VPR/interviews lists.
- **Jobs Trash:** `JobTrashList` (per-row Restore + Erase permanently, no status actions) +
  `countTrashedJobs` badge; erase dialog = shared `JobEraseButton`.
- **Trash confirms** list linked ACTIVE items (open VPRs / in-flight subs / active placements;
  active placement blocks) — `job-danger-zone.tsx`, `candidate-danger-zone.tsx`.
- **Delete a VPR when empty (0 submissions), else Cancel** — `deleteVendorRequirement` logs
  `REQUIREMENT_DELETED` (migration `20260708190000`) on the parent job.
- **Round-1 review + P2 fixes:** `listCandidateOptions` filters `deletedAt: null` (was leaking
  trashed into pickers); submission-form stale-gate suppressed on candidate change
  (`gateDismissed`); candidate list `whitespace-nowrap` (row-height); upload-saves-to-library copy.

> **Open owner questions (unchanged, still gating rate/scorecard work):** confirm rate chain;
> retire legacy Candidate rate; "New vendors" company-wide semantics; rate guardrail soft vs
> hard; cap requirements per job. In the walkthrough DOCX.

## 🚧 (Superseded) Current work — Rate model, clientRate, company-wide scorecard, rate guardrail (2026-06-22, PRs #32–#35, on `main`)

Post-verification baseline: `main` @ `23c4f86`, no open PRs, tsc clean, 113 unit tests.
Demo reseeded + sent to the stakeholder for verification (creds `sriman@lumintrack.com`
admin+team-lead / `hrishikesh@lumintrack.com` recruiter, password `LuminTrack2026!`);
`LuminTrack-App-Walkthrough.docx` (feature tour + open questions) delivered. **Awaiting
stakeholder feedback.**

- **`clientRate` end-to-end (PR #32).** New nullable `clientRate Decimal(12,2)` on **Job,
  Submission, Placement, VendorRequirement** (migration `20260622190000_client_rate`,
  applied to the Neon dev DB), wired through Zod schemas, all create/edit forms, server
  actions (incl. audit-drift compare + the VPR→submission convert path), and queries
  (Decimal→number flatten). Rate model documented above. `candidateRate` intentionally
  **not** dropped (owner to confirm).
- **Live rate-chain warning (PR #34).** `src/lib/rates.ts` `rateChainWarnings()` +
  `src/components/ui/rate-chain-warning.tsx` — advisory amber note on the submission
  new/edit forms when rates break the chain (pay>bill / bill,candidate>client). **Never
  blocks a save**; silent when client rate is blank. 10 unit tests in `src/lib/__tests__/rates.test.ts`.
- **Company-wide "New vendors" scorecard (PR #32).** `getMonthlyScorecard`
  (`src/server/queries/monthly-scorecard.ts`) now counts the first-ever submission *anyone*
  made to a vendor (credited to whoever made it), not per-recruiter.
- **UX clarity fixes (PR #32).** Admin-only weekly-margin strip on `/placements`; JOINED
  cascade heads-up on the submission status form; clarified rate/source/vendor/client hints;
  "⚠ Rates pending" shown when bill==pay (instead of a fake $0 margin); Candidates/Bench/Settings copy.
- **Bug fixes.** clientRate `Decimal` leak on `/submissions` (`flattenRow` missed the new
  column — PR #33); clientRate dropped on the VPR→submission convert path (the convert
  action's `safeParse` omitted the field while still writing it — PR #35). Both in `docs/DEVLOG.md`.

> **Open owner questions gating the rate model + scorecard** (in the walkthrough DOCX):
> confirm the rate chain; retire legacy Candidate rate?; "New vendors" company-wide
> semantics; rate guardrail soft-warn vs hard-block; cap requirements per job? Hold
> rate/scorecard changes until answered.

## ✅ Vendor Portal Requirements (R0–R5) — SHIPPED 2026-06-22 (on `bench-sales-build` / PR #31)

A pre-submission **planning layer**: a team-lead/admin scopes a vendor
requirement's commercial terms; a recruiter later "moves it to a submission"
(prefilled + editable), creating the real Submission. Modeled as a **separate
`VendorRequirement` table** (not Submission+status) so it's invisible to all
submission analytics by construction. **Team lead = `User.isTeamLead` flag**
(not a 3rd role); `canManageRequirements = ADMIN || isTeamLead`. Convert reuses an
extracted `createSubmissionRecord(tx, …)` (`src/server/submission-create.ts`) via
an idempotent OPEN→CONVERTED claim + a `ConvertGate` sentinel rollback so a
shared gate (duplicate/iLabor) never orphans a submission. Display id `VPR-###`.
Key files: `src/app/(dashboard)/vendor-portal/{page,new,[id],[id]/edit,[id]/convert}`,
`src/components/vendor-portal/*`, `src/server/{actions,queries}/requirements.ts`,
`src/server/team-lead.ts`. Nav "Vendor Portal" → "Vendor Portal Requirements";
the old `/jobs?source=randstad` tab relabeled "iLabor Requisitions". Job-create
form has an optional "plan a requirement" section; job detail + dashboard surface
them. Full detail + the resume marker: the plan file's "🟢 PROGRESS" block.
**Owner to-do:** reseed (`npx tsx prisma/seed-demo.ts`) → restart → re-login;
real-browser eyeball; `git push`.

## 🚧 Current work — Lifecycle bench + reseed + Vendor Portal tab + filter redesign (2026-06-21, on `bench-sales-build` / PR #31)

Four phases, all shipped to the branch (green CI). Plan:
`~/.claude/plans/users-smumma-documents-company-dashboar-prancy-lightning.md`
(active section at top).

- **Phase 0 — Lifecycle bench (no migration).** Owner's model: the Bench is "who
  we're marketing now." A candidate is on the bench via a `BenchConsultant`
  linked 1:1 (`candidateId`), and `marketingStatus` drives on/off-bench
  (ACTIVE/PAUSED = on, PLACED/INACTIVE = off). New `src/server/bench-lifecycle.ts`:
  `ensureBenchForCandidate` (auto-creates the linked bench row when a candidate is
  created AVAILABLE — wired in `createCandidate`) + `syncBenchOnPlacement` (wired
  into `placement-lifecycle.ts`: JOINED → PLACED, placement-end/revert → ACTIVE).
  One-click **Remove from bench** (`removeFromBench` → INACTIVE) on the detail
  page. Roster defaults to on-bench (new `onBench` filter on `listBenchConsultants`).
  +3 integration tests.
- **Phase A — Reseed (`prisma/seed-demo.ts`, run `npx tsx prisma/seed-demo.ts`).**
  **Admin login changed → `sriman@lumintrack.com` / `LuminTrack2026!`** (Sriman
  Udugula, the team lead). 11 users total: **3 admins** (Sriman + 2 generated
  managers) + **8 recruiters** (3 real from the sheet — Hrishikesh Batta TK2090,
  Sameer Shaik TK2161, Akhila Kalyadapu INC83 — + 5 generated), across **2 teams**
  (`USEI-Sales IT` / `USEI-Sales IT-2`). Bench consultants now seeded **linked 1:1
  to candidates** with `marketingStatus` derived from pipeline state. New edge
  cases: candidate documents with past/within-30d/future expiries, iLabor jobs
  closed-for-subs / at-cap / unassigned, rates-pending placements, archived
  résumés, all candidate/submission statuses.
- **Phase B — Vendor Portal nav tab.** New `/vendor-portal` route +
  `nav-links.tsx` entry (ClipboardList, after Jobs); reuses
  `listJobs({ source: "randstad" })`. `JobsTable` gained optional
  `storageKey`/`columnDefaults` props + 4 requirement columns (positions,
  submitLimit, externalActiveCount, releasedDate) so the view leads with the
  requisition fields. The old `/jobs?source=randstad` sub-tab still works.
- **Phase C — Unified filter redesign + Placements date filter.** New
  `src/components/ui/date-range-field.tsx` (preset dropdown that reveals From/To
  **inline** on "Custom range"). Restyled `FilterBar` (kept API; added optional
  `search` prop = polished icon search box; indigo pill chips). Migrated all list
  pages: Placements (new `startedRange` startDate filter), Bench, Interviews onto
  FilterBar; Jobs/Candidates/Submissions adopt the `search` prop;
  `analytics-filters` (Recruiters/Reports) swapped preset+from/to → inline
  `DateRangeField` (fixes the custom-range-hides-inputs gap).
- **Also fixed: `src/proxy.ts` matcher** — excluded the whole `_next/` tree (was
  only `_next/static|_next/image`), so middleware no longer runs on
  `/_next/webpack-hmr` and breaks the dev HMR WebSocket (→ broken hydration). See
  `docs/DEVLOG.md` 2026-06-21.

> **Verification caveat (2026-06-21):** client interactivity (the Filters
> expand/collapse toggle, the custom-range click-reveal) could **not** be verified
> through the agent's browser tooling — the preview/Playwright path can't complete
> the HMR WebSocket handshake, so React doesn't hydrate there. Native form
> filtering (search/dropdowns/Apply → GET) IS verified, and the reveal is verified
> server-side (`?preset=custom` renders the inputs). The toggle/reveal are standard
> `useState` (unchanged pattern) — **needs a real-browser eyeball** (owner testing
> on Vercel preview or a clean local `npm run dev`). Owner reported the toggle not
> opening; the proxy matcher fix is the prime suspect (restart + hard-refresh).

## 🚧 Current work — Bench-Sales build (post-June-19 demo)

After the 2026-06-20 demo the stakeholder handed over
`Dashboard - requirements- user-june-19th.xlsx` (6 tabs). The product owner
**pivoted** the architecture: most tabs map onto existing concepts, so only two
things are genuinely new. Full plan:
`~/.claude/plans/users-smumma-documents-company-dashboar-prancy-lightning.md`.
**All phases SHIPPED + verified 2026-06-20.**

- **P1 — Bench roster:** new `BenchConsultant` table (the marketing "as-marketed"
  identity), optionally 1:1-linked to `Candidate` via `candidateId @unique`.
  `/bench` roster groups by `BenchPriority` (HIGH/SECOND), `ColumnsMenu` defaults
  to the sheet's display subset; add/edit form has grouped sections + a
  collapsible "More details" + an **admin-gated marketing-credentials** section
  (`canViewBenchCredentials` in `src/lib/permissions.ts`, masked password +
  Reveal). New enums `BenchPriority`/`BenchMarketingStatus`/`BenchEngagement`;
  `BC-001` display IDs; `Note`/`Activity` gained `benchConsultantId`. Migrations
  `20260620120000` (P0 enum/user fields) + `20260620130000`.
- **P2 — Submission bench fields:** `engagement` (C2C/W2), `vendorRecruiterName`,
  `jobDuties` on `Submission` (migration `20260620140000`); wired through
  form/edit/table (hidden-by-default cols)/detail. `SUBMISSION_UPDATED` covers it.
- **P3 — Interviews list:** standalone read-only `/interviews` roll-up
  (`listInterviews`) of every scheduled round, linking to candidate + submission.
- **P4 — Vendor Portal:** Jobs "Randstad iLabor" source tab relabeled →
  "Vendor Portal" (**label only** — `randstad` key + portal-name filter intact).
- **P5 — Monthly Performance:** added `SubmissionStatus.BACKED_OUT` (migration
  `20260620150000`, standalone enum-add) + the exhaustive-map fan-out
  (`labels.ts`, `validation/submission.ts` `SUBMISSION_STATUS_VALUES` — which
  also closed a pre-existing missing-`OFFER_ACCEPTED` gap, `reports.ts`
  `TERMINAL`, `dashboard.ts` active-pipeline `notIn`). `/reports` became a
  `?tab=` router (`reports-tabs.tsx` + `analytics-tab.tsx` (old body moved
  verbatim) + `monthly-performance-tab.tsx`); Analytics is the no-param default
  so its filters/pagination are unchanged. `getMonthlyScorecard`
  (`src/server/queries/monthly-scorecard.ts`, in-memory Mon-start weekly buckets
  via date-fns `eachWeekOfInterval`) drives `scorecard-grid.tsx` (2-row grouped
  header, sticky recruiter col, team Total + grand Total rows, red non-zero
  Backouts) + `scorecard-picker.tsx` (`?month=YYYY-MM&team=`). Metrics:
  Submissions/Backouts (on `submittedAt`), Interviews (round `scheduledAt`),
  New vendors (recruiter's first-ever submit to a vendor), Closures (placement
  `startDate`). Seed sets `User.empId` (`EMP-101..`) + teams Alpha/Beta;
  `prisma/backfill-emp-team.ts` for real data. **Also fixed:** `seed-demo` wipe
  was missing Placements/Documents/Bench (FK violation on re-seed) — now a
  comprehensive FK-safe cascade.

> **Migration workflow (non-interactive shell):** `prisma migrate dev` is
> interactive — instead hand-write the SQL under `prisma/migrations/<ts>_<name>/`
> then `prisma migrate deploy` + `prisma generate`. **After `generate`, RESTART
> the dev server** (HMR does not reload the regenerated client) — which also
> **logs you out** (session cookie), so re-login after a restart.

## 🚧 Current work — Round 5: Submission & workflow UX overhaul (IN PROGRESS)

Owner asked (2026-05-29) for a deep rework of the submission experience.
A 5-persona UX/product audit (recruiter, admin, UX, PM, QA) all converged on
the same problems. Full plan + decisions + phased build in
[`docs/PLAN_submission_workflow_overhaul.md`](./docs/PLAN_submission_workflow_overhaul.md)
(working copy: `~/.claude/plans/i-got-a-initial-cozy-sloth.md`).

**Owner decisions:** (1) submissions **gated by assignment with self-claim**
("Claim this job" → submit; admins submit/assign freely); (2) **three submit
entry points** sharing one form (job page + candidate page + global
`/submissions` "New submission"); (3) override + status reasons become a
**preset list + optional note**; (4) all four areas in scope (submission flow,
assignment, columns/density, confirmations/feedback).

**Top problems found:** no toast/success feedback anywhere (silent saves,
incl. the JOINED→placement cascade); submissions only startable from a job
page; assignment is decorative (`createSubmission` never reads `JobAssignment`);
override gates are toothless/brittle (`error.startsWith("iLabor")` field sniff);
no inline list editing; submissions list lacks days-in-stage / "mine stale >7d";
résumé silently wiped on candidate switch; native `window.confirm` in 4 delete
paths; `submittedById` un-correctable.

**Phases:** 1 — toast primitive + typed gate kinds (foundational); 2 —
assignment gate + self-claim + 3 entry points; 3 — wire toasts + branded
confirm dialogs; 4 — submissions-list upgrades; 5 — polish. Reasons are
`labels.ts` string sets, so the only possible migration is one optional
`Activity.isOverride` boolean.

**Post-build UX testing (2026-05-29/30, admin + recruiter personas via the
Claude-in-Chrome extension).** Live test tracker (what's tested / pending, incl.
the `uploads/` iLabor scenarios) in
[`docs/ROUND5_UX_FINDINGS.md`](./docs/ROUND5_UX_FINDINGS.md). The headline
assignment-gate + self-claim flow, all three submit entry points, the
"Mine, stale >7d" filter, the Columns menu, and the iLabor `closed` gate were
all verified live. **Four bugs found + fixed (all shipped to `main`):**
- `dc0fe1d` — after any submission gate, React 19's post-action `<form>` reset
  snapped controlled `<select>`s to their first option, silently mis-attributing
  `submittedById`. Fixed with a hidden-input backstop + a remount key on the
  selects (`submission-form.tsx`).
- `542c65c` — same React-19 reset exposure applied to `submission-edit-form.tsx`
  (the earlier follow-up; now done).
- `38871b4` — the "days in stage > 7d" **amber stale highlight never rendered**:
  `<Td>` bakes in `text-slate-700` and `cn()` has no `tailwind-merge`, so the
  passed `text-amber-700` lost the cascade. Moved the colour onto the inner span.
- `1a99bc4` — a recruiter on a job that's **both unassigned and iLabor-closed**
  (or capped/duplicate) was trapped in an infinite not_assigned → claim → second
  gate → not_assigned loop, because `claim=1` only lived in the not-assigned
  block. Fixed by latching `claimIntent` and persisting `claim=1` across
  follow-up gates.

**Résumé archive (soft delete) — SHIPPED 2026-05-30 (commit `cf03c8f`,
migration `20260530052124_resume_soft_delete`).** "Deleting" a résumé now
**archives** it (`CandidateResume.isActive = false`) instead of hard-deleting,
so a submission keeps its live `candidateResumeId` link (and snapshot) — the
résumé → submission → interview chain stays intact. New `archiveCandidateResume`
/ `restoreCandidateResume` actions (`RESUME_ARCHIVED` / `RESUME_RESTORED`
audit); `deleteCandidateResume` kept but guarded to **zero-submission** résumés
only. The new-submission picker (`listCandidateOptions`) offers active résumés
only; the edit form (`getSubmissionForEdit`) also includes the in-use résumé
even if archived, labelled "(archived)", so the controlled select never drops
the saved selection. The library splits active vs archived behind a
"Show archived (N)" chip with an *Archived* badge + Restore; permanent delete
shows only on unused résumés. Verified live end-to-end.

**Loose-ends wrap (2026-05-30).** (1) **`cn()` → `tailwind-merge`**
([`src/lib/cn.ts`](./src/lib/cn.ts)): the amber-highlight bug's root cause was
`cn` plain-joining classes with no conflict resolution, so a component's baked
`text-slate-700` beat a caller's `text-*`. Now conflicts resolve last-wins,
fixing the whole class — including a silently-defeated `text-red-600` on the
reports negative-margin cell. The submissions stale cell reverted to the simple
cell-level colour. (2) **Contacts dialog** close-with-unsaved-edits prompt is now
a branded `ConfirmDialog` (the rare cross-entity-switch guard stays native — a
synchronous render-phase decision). (3) **iLabor cap gate verified live**. All
delete confirm dialogs are branded `ConfirmSubmit`. Remaining low-priority,
code-verified-only: job-status-change toast + no-toast-on-login.

## 🚧 Current work — Round 4 pre-demo (Documents → Placements → Export)

Admin handed over a new pre-demo requirements bundle on 2026-05-28.
The full plan + UI/UX shape + code-review fixes live in
`~/.claude/plans/expressive-whistling-hedgehog.md`.

- **R4.1 — Candidate documents library: SHIPPED 2026-05-28.**
  Per-candidate `CandidateDocument` model (4 categories: Identity,
  Work Auth, Education, Employment; the first two gated to admin via
  `src/lib/permissions.ts`), Google-Drive-link storage matching
  `CandidateResume`, optional issued / expiry dates, expiry color
  pills (slate / amber / red) and a Deel-style "expiring within 30
  days" banner. Mounted on `/candidates/[id]` between résumés and
  submissions; Dashboard "Needs attention" card gained a third sub-
  section "Documents expiring (30 days)" scoped by `?scope=me|org`.
  Audit log: `CANDIDATE_DOCUMENT_ADDED / UPDATED / REMOVED` (migration
  `20260528183656_r4_1_candidate_documents`).
- **R4.2 — Placements tab: SHIPPED 2026-05-28.**
  Auto-creates a `Placement` row when a submission status flips to
  JOINED (`PlacementStatus`: ACTIVE / EXTENDED / ENDED /
  TERMINATED), with `billRate` / `payRate` `Decimal(12, 2)`,
  extensions via `PlacementExtension` rows (overlap-blocked by Zod,
  edit-only), end-of-placement card with reason + optional
  replacement-submission picker (named relation
  `"PlacementReplacement"`), and a candidate-lifecycle cascade:
  Candidate.status auto-flips to PLACED on JOINED and back to
  AVAILABLE when no other ACTIVE/EXTENDED placements remain (logged
  via `CANDIDATE_STATUS_CHANGED`). Reverting a JOINED submission
  marks the placement TERMINATED with a system endNote rather than
  hard-deleting (no-hard-delete project norm). Concurrent-JOINED
  race protected by `submissionId @unique` + a P2002 no-op catch.
  Rate edits gated to admin OR submission's recruiter-of-record
  (`src/server/actions/placements.ts`); list page masks rates for
  ineligible viewers. Lifecycle helpers extracted into
  `src/server/placement-lifecycle.ts` and reused by both
  submissions.ts and placements.ts. New `/placements` list with
  sticky summary strip (active count · weekly margin · ending in
  14d), default ACTIVE filter, ColumnsMenu (Recruiter hidden by
  default), and `PLC-001` display IDs. Detail page at
  `/placements/[id]` has a summary grid, details card, extension
  history mini-cards + inline Extend popover, and an
  end-of-placement card that only renders when the placement is no
  longer ACTIVE. Reports gained "Active placements + projected
  margin" (Σ (bill − pay) × 8h × remaining-days, 90-day fallback
  for open-ended, amber when < 15%, red when negative). Dashboard
  "Needs attention" gets a "Placements with rates pending"
  sub-list (admin + org scope only). Candidate detail shows a
  "Currently placed" pinned card while ACTIVE and a "Placement
  history" sub-table for past ones. Backfill via
  `npx tsx prisma/backfill-placements.ts` (idempotent). Migrations:
  `20260528193426_placements_and_extensions` (tables + enums) +
  `20260528193550_placement_audit_actions` (`PLACEMENT_*` and
  `CANDIDATE_STATUS_CHANGED` enum value adds — split because
  Postgres can't add enum values and use them in one transactional
  migration).
- **R4.3 — Manual data export: SHIPPED 2026-05-28.**
  Two Route Handlers under `src/app/api/export/`: `full/route.ts`
  returns a restore-grade JSON dump of every table (User rows have
  `passwordHash` stripped); `excel/route.ts` builds a multi-sheet
  `.xlsx` via `exceljs` with two modes — `business` (no PII, no
  rates, no Identity/Work Auth documents, no résumé Drive links,
  no activity log) and `full` (admin-only — everything). Shared
  builders live in `src/server/exporters/` (`build-backup-json.ts`,
  `build-business-excel.ts`) so the deferred R4.4 cron can reuse
  them. Admin-only `/settings/export` page has a segmented mode
  toggle, grouped entity checkboxes (Operational / Reference /
  Sensitive — Sensitive group hidden in business mode), live
  pre-flight summary driven by `getBackupPreflight()`, two
  download buttons (Excel primary, JSON full-mode only), and an
  Export history table reading the last 20 `DATA_EXPORTED` audit
  rows. Each export logs `DATA_EXPORTED` with a `mode=…;format=…;
  entities=…;bytes=…` note. Migration
  `20260528200000_data_exported_action` adds the enum value.
- **R4.4 — Scheduled Drive backup: deferred to post-demo.**
- **Pre-demo polish round (2026-05-28, commits `ae4847f..03fede5`):**
  surgical fixes surfaced during a scenario sweep + data-driven
  re-import deep dive.
  - **Placement reactivation on re-JOINED** (`ae4847f`):
    `ensurePlacementOnJoined` now finds-then-reactivates a
    TERMINATED/ENDED placement before falling through to create,
    logging `PLACEMENT_UPDATED note=reactivated`. Closes the
    inconsistent-state path where reverting JOINED → re-applying
    JOINED left the candidate flagged PLACED with zero ACTIVE
    placements.
  - **Candidate-status guard** (`ae4847f`): `updateCandidate`
    blocks manual status edits away from PLACED while an ACTIVE/
    EXTENDED placement exists. The lifecycle helper owns PLACED ↔
    AVAILABLE transitions.
  - **Replaces-pill on placement detail** (`018fc6e`):
    `getPredecessorPlacement(submissionId)` finds the prior
    placement that picked this submission as a replacement; the
    detail page header shows "Replaces PLC-007 (Jane Doe)".
  - **Expiring-docs banner on placement detail** (`018fc6e`):
    `getExpiringDocumentsForCandidate` surfaces a candidate's
    documents expiring within 30 days as an amber banner on the
    placement page while ACTIVE — compliance signal where it
    matters, not just hidden on the candidate page.
  - **Restore-from-backup script** (`a878f00`):
    `prisma/restore-from-backup.ts`. Dry-run by default; `--confirm`
    wipes + re-inserts every table from a backup JSON in FK-safe
    order. User rows get a placeholder password hash and
    `isActive=false` so login is blocked until reset. Makes the
    "restore-grade" claim on the JSON dump actually true.
  - **Streaming Excel export** (`a878f00`, `ef95d13`):
    `buildBusinessExcel` → `streamBusinessExcel` (returns a Node
    `Readable` via `ExcelJS.stream.xlsx.WorkbookWriter`); route
    handler returns `Readable.toWeb(stream)` so large workbooks
    no longer hold the whole file in memory. `buildBusinessExcelBuffer`
    kept for the deferred R4.4 cron. Worksheet `views` must go in
    the `addWorksheet` options bag — the streaming writer rejects
    `ws.views = ...` as read-only.
  - **Reports `<thead>` fix** (`3425b90`): `CollapsibleTable` now
    wraps the `head` row in `<thead>`; bare `<tr>` inside `<table>`
    was tripping React's hydration warning on `/reports`.
- **iLabor re-import hardening (2026-05-28, commits
  `a1aa862..03fede5`):** data-driven gap closure on what else
  could go wrong on a re-import. See `ENHANCEMENTS.md` "Round 4
  follow-ups" for the remaining medium/low items.
  - **3 iLabor signal fields captured** (`a1aa862`, migration
    `20260528210000_ilabor_signal_fields`): nullable `Job.submitLimit`
    (always 30 in sample), `Job.ilaborSubmitOpen` (0 = iLabor closed
    for subs, 1 = accepting; 52/306 rows = 0), `Job.ilaborScreenerCode`
    (>0 means screener attached; 33/306 rows = 3). Job detail iLabor
    card now renders Accepting / "Submissions closed at iLabor" pill
    next to the iLabor subs count, Submission cap row, and a
    "Screening required" amber badge. "Department" row hidden when
    the value is "Default" (all 306 sample rows).
  - **Soft submission gates** (`a1aa862`): `createSubmission`
    gained two `needsConfirm` paths reusing the duplicate-override
    pattern — `ilabor_closed` (when `ilaborSubmitOpen === 0`) and
    `ilabor_cap` (when `max(externalActiveCount, local active
    count) >= submitLimit`). Override field is `ilaborOverrideReason`;
    the `CANDIDATE_SUBMITTED` audit note composes from up to two
    triggers, joined by "; ".
  - **Preview drift detection** (`962e861`): `RowDigest` gained
    `titleDrifted` / `customerDrifted` / `existing*` fields; the
    preview shows red "title changed" / "client changed" badges on
    updated rows and a top-of-preview red banner with the drifted
    count. The per-job `JOB_UPDATED` audit row that already fired
    for client/vendor relinks now also fires on title change, with
    a unified diff in the description.
  - **4 re-import guards** (`03fede5`):
    1. **Intra-batch Req ID dedup** — `validateRows` skips duplicate
       `requisitionId`s within a single file and emits a per-row
       "Duplicate requisitionId" error so the dropped row appears
       in the skipped list.
    2. **Effective active count** — job detail card shows
       `max(externalActiveCount, local non-terminal sub count)`
       instead of iLabor's stale snapshot; amber inline note shows
       the iLabor value when they diverge.
    3. **Disappeared-from-iLabor signal** — new `listStaleIlaborJobs`
       query surfaces portal-linked jobs still OPEN/ON_HOLD whose
       `lastImportedAt` predates the most recent
       `REQUISITIONS_IMPORTED` audit row; `/jobs/imports` renders
       them as an amber "Stale iLabor jobs" section.
    4. **Case-insensitive Vendor/Client match** — `findFirst({mode:
       "insensitive"})` → create-if-missing replaces the exact-name
       upsert. "RANDSTAD" and "Randstad" now reuse the same row;
       previously the rename created orphan rows. Preview lists
       net-new vendor/client names so a true rename ("RANDSTAD" →
       "Randstad Technologies") is visible before commit.

## iLabor requisition import (Phase 8b: browser extension is next)

Active build: importing Randstad iLabor requisitions into LuminTrack via a
browser-extension → JSON-file → admin-upload pipeline, plus related Jobs-page
enhancements.

**Read first:** [`ILABOR_IMPORT_HANDOFF.md`](./ILABOR_IMPORT_HANDOFF.md) — live
snapshot, file map, resolved decisions, iLabor JSON sample. The architectural
"why" lives in [`docs/PLAN_iLabor_import.md`](./docs/PLAN_iLabor_import.md).

> **✅ Fix shipped (2026-05-28) — iLabor import "expired transaction".**
> The 306-row sample import used to crash with a Prisma "expired
> transaction" error inside `logActivity`. Root cause was the single
> 60s interactive `$transaction` wrapping the whole import in
> `src/server/actions/ilabor-import.ts` — not `logActivity` itself.
> Now split into a session-scoped `pg_try_advisory_lock` +
> un-wrapped prep + per-row mini `$transaction(job.upsert + audit)` +
> un-wrapped summary audit. See `docs/DEVLOG.md` for the full story.

- **Status:** Phases 0–7 done **and** the post-Phase-7 polish round shipped
  (concurrent-import lock, per-job `JOB_IMPORTED` audit + backfill, `/jobs/imports`
  history page, page-jump input, SNo on candidate/submission lists,
  `jobSourceLabel` portal fallback). Phase 8b — the browser extension in a
  separate repo — is the only piece remaining.
- **Audit follow-ups:** see [`bugs.md`](./bugs.md) — "Polish round 2"
  (2026-05-24 audit) is now **mostly shipped**: correctness items 1–6, UX
  items 8–14, dialog focus trap, error/not-found pages, mobile topbar,
  dashboard tooltips + Top-5 source bucket, Reports Joined %, sub-table
  pagination, collapsed timeline, column pickers on Candidates/Submissions
  with shared `ColumnsMenu` + keyboard reorder, plus Round 3 §A1 (manual
  job form parity for 7 iLabor columns) — all in commits 861c90f..e9d5652
  (2026-05-25). **Round 3.5 also shipped 2026-05-25**: Dashboard "Active
  jobs" subtitle tightened, Candidates Skills column hidden-by-default +
  capped at 3 chips with `+N` tooltip, new `Candidate.featuredSkills`
  star-picker (chip wall) feeding the list-view truncation, candidate
  detail Interview History replaced with grouped-by-job rows + ✓/✗/⌛
  pips + `<details>` expand, sub-tables paginate at `SUB_PAGE_SIZE = 5`
  (with `Pagination` `pageSize` prop + jump input at >3 pages), and
  `listCandidates`/`listSubmissions` now flatten Prisma `Decimal`
  fields before returning so the Client-Component tables don't crash.
  **Tier 1 pre-demo fixes shipped 2026-05-25** (commits
  `1296300..144296a`): org-entity writes (clients/vendors/sources) gated
  on admin role; `useFocusTrap` hook extracted from `Dialog` and adopted
  by `MobileNav`; `buttonClass` gains a visible focus-ring; submission
  status form uses `useTransition` for a pending button; global topbar
  search supports ↑/↓/Enter keyboard nav with combobox ARIA; new
  `?scope=me|org` Dashboard toggle (defaults to `me` for recruiters,
  `org` for admins) plus a "My work — needs attention" card driven
  by a new `getMyWork(userId)` query.
- **Post-demo polish shipped 2026-05-25** (commits `3cd010c..ea73c31`):
  optional `meetingLink` URL on `InterviewRound` (migration
  `20260525120000_interview_meeting_link`) with form input + "Join"
  link on round cards and the candidate interview-history sub-table;
  candidate interview-history switched from a cramped `<table>` to
  per-round mini-cards (mirrors `interview-rounds-manager.tsx`
  pattern), and the collapsed group row reorganized into a two-cluster
  layout — `Job · Client` on the left, `[status] [pips] date See details`
  on the right — fixing the "stacked at narrow widths" complaint.
- **Narrow-width hardening (2026-05-25, commits `3683f2f`, `596bd9b`):**
  the interview-history summary row's two clusters now wrap as *units*
  at every viewport tested (1280 → 360 px). The `·` separator binds to
  the client name in a single inline-flex span, and the date + "See
  details ▾" toggle share a `whitespace-nowrap` span so they never
  orphan. Pip row tightened to `flex-nowrap` (capped at 5 so width is
  bounded). Verified with Playwright MCP screenshots.
- **Medium-bug sweep shipped 2026-05-26** (PRs #6 / #7 / #8):
  - **§B4 + §E2 + §E3 + §E4** — `Candidate.status` (CandidateStatus enum:
    AVAILABLE / PLACED / NOT_INTERESTED / DO_NOT_CONTACT, separate from
    `isActive`), `tags[]` (lowercased free-form labels), `lastContactedAt`
    (bumped explicitly via new `markCandidateContacted` action + new
    `CANDIDATE_CONTACTED` audit), `source` (free-text origin). Migration
    `20260526140000_candidate_status_tags_contact_source` + companion
    `20260526145000_restore_array_defaults`. Candidate form gets the four
    inputs; detail page surfaces status badge + source + last-contacted
    row + tag chips.
  - **§D5 + §C4** — `InterviewRound.scheduledTimezone` (IANA string,
    UTC `scheduledAt` unchanged); dropped `@@unique([candidateId, jobId])`
    on Submission and replaced the DB block with an action-layer duplicate
    check that captures `duplicateReason` and a custom audit note when
    overridden. Migration `20260526150000_interview_tz_and_dup_override`.
  - **§F3 + §F4 + §J2** — `/reports` gained a "Recruiter aging" table
    (submissions >14 days still in early pipeline stages) + a "Client
    revenue projection" table (`Σ candidateRate × 8h × duration ×
    positions` for OPEN/ON_HOLD jobs, 90-day default duration when
    start/end dates missing). New admin-only `/audit` route — org-wide
    activity log filterable by action + user, paginated 25/page, linked
    from Settings → Admin tools. No migration.
- **§F2 funnel velocity shipped 2026-05-26** (PR #11): `/reports` gained
  a "Time to fill" card (median + p90 days from `Job.createdAt` to a
  JOINED submission, overall + by client + by source) and a "Time in
  stage" table (median + p90 days each submission sits in each
  non-terminal pipeline status, walked from `SUBMISSION_STATUS_CHANGED`
  audit rows). No migration. New `median()` / `percentile()` helpers in
  `src/server/queries/reports.ts`.
- **iLabor signal fields shipped 2026-05-28**: data-driven gap closure
  after a fill-rate scan over the 306-row sample. New nullable columns
  on `Job` — `submitLimit` (iLabor's per-req max), `ilaborSubmitOpen`
  (0 = iLabor closed for subs, 1 = accepting; raw int preserved for
  unknown values), and `ilaborScreenerCode` (>0 means a screener is
  attached). iLabor card on `/jobs/[id]` now shows an Accepting /
  "Submissions closed at iLabor" pill next to the iLabor subs count,
  a "Submission cap" row, and a "Screening required" amber badge
  when a screener is attached. The "Department" row is hidden when
  the value is literally "Default" (all 306 sample rows). `createSubmission`
  gained two soft warnings reusing the existing duplicate-override
  pattern: `ilabor_closed` fires when iLabor stopped accepting subs,
  `ilabor_cap` fires when `max(externalActiveCount, local active
  count) ≥ submitLimit`. Both override with a reason field
  (`ilaborOverrideReason`) appended to the `CANDIDATE_SUBMITTED`
  audit note as `ilabor-override:<reason>`. Manual job form
  unchanged — these are iLabor system signals. Migration
  `20260528210000_ilabor_signal_fields`.
- **Remaining large items moved to [`ENHANCEMENTS.md`](./ENHANCEMENTS.md):**
  §J1 PII export → iLabor 8b extension → §J3 admin 2FA → §E1 résumé
  parsing → §J4 session inspector. **§G1-G3 (notifications) and §I4
  (dark mode) are deferred indefinitely on user direction.**
- **Process:** phase-by-phase with product-owner confirmation between phases;
  teaching-style narration of meaningful code; additive only — the existing
  dashboard's behavior is unchanged for anyone not exercising the new flow.

## Build status

All 7 original build phases are complete and verified:

- **Phase 1** — Foundation & Auth ✅
- **Phase 2** — Jobs & org entities ✅
- **Phase 3** — Candidates (Drive-link résumé + inline preview, duplicate warning) ✅
- **Phase 4** — Submissions (status pipeline, duplicate prevention) ✅
- **Phase 5** — Interview rounds ✅
- **Phase 6** — Timeline / audit UI + Notes ✅
- **Phase 7** — Dashboard, Reports, Recruiters, global search ✅

iLabor import sub-build (additive — see `ILABOR_IMPORT_HANDOFF.md`):

- **iLabor Phases 0–3** — Recon, schema + migration, validation, server actions ✅
- **iLabor Phase 4** — `/jobs/import` admin wizard (upload → preview → confirm) ✅
- **iLabor Phase 5** — Source sub-tabs (`?source=`) + iLabor detail card ✅
- **iLabor Phase 6** — Column show/hide + drag-reorder on Jobs list (`useColumnPrefs`) ✅
- **iLabor Phase 7** — Display IDs (`JOB-00123` / `REQ-159263` / `CAND-001` / `SUB-001`) + SNo ✅
- **iLabor Phase 8a (polish)** — pg advisory lock on import, per-job `JOB_IMPORTED` audit + backfill, `/jobs/imports` history page, page-jump input, source-label portal fallback ✅
- **iLabor Phase 8b** — Browser extension (separate repo, Manifest V3) ⏳

The tolerant envelope adapter (added in Phase 4 polish) means admins can paste
raw iLabor network captures directly today — the extension is purely a UX
upgrade, not a functional gate.

**Post-Phase-7 work (committed to `main`):**
- List pages (Jobs/Candidates/Submissions/Recruiters) gained clickable column
  **sorting** (`?sort=&dir=`), **10-row pagination** (`?page=`), and a **collapsible
  filter bar** — shared primitives `src/components/ui/{sortable-header,pagination,filter-bar}.tsx`;
  list queries return `{ rows, total, page }`.
- Phase 7 review bugs fixed (Dashboard "Active jobs" KPI subtitle, dead recruiter-detail
  filter, admin excluded from the Recruiters list, `$/hr` rate units, clearer timeline labels).
- **Résumé library** — each candidate keeps many labelled Google Drive résumés
  (`CandidateResume`, 1:N), managed in a section on the candidate detail page. Submitting
  a candidate picks a saved résumé or adds one inline (optional). The submission keeps
  `resumeDriveLink` as a snapshot (so history survives résumé edits/deletes) plus a
  nullable `candidateResumeId` FK; `Candidate.resumeDriveLink` was dropped. Shown on the
  submission detail (inline preview) and as a column on the job's candidate table.
- **Submission edit form** — `/submissions/[id]/edit` lets the rate, résumé, and notes
  of an existing submission be changed (candidate, job, and recruiter stay fixed at
  creation; status keeps its own form). Reuses the résumé picker via a shared
  `submissionEditSchema`; `updateSubmission` logs a new `SUBMISSION_UPDATED` audit
  action (migration `20260522020000_submission_updated_action`).
- **Status-change context** — the "Update status" form also captures an optional
  real-world event date/time, a note, and (for Rejected / On Hold) a preset reason.
  Stored on three new nullable `Activity` columns (`eventAt`, `note`, `reason`;
  migration `20260522030000_status_change_details`) and shown on the activity
  timeline. Reason presets live in `src/lib/labels.ts` as app-level strings.
- **iLabor bulk import (Phases 4–8a)** — `/jobs/import` admin wizard,
  `/jobs/imports` history page, source sub-tabs on the Jobs list, read-only
  iLabor requisition card on job detail, column show/hide + drag-reorder
  (`useColumnPrefs` hook + localStorage, versioned), display IDs (`JOB-00123` /
  `REQ-159263` / `CAND-001` / `SUB-001`) backed by `seq Int @unique @default(autoincrement())`
  on Job / Candidate / Submission (migration `20260524160000_display_sequences`),
  SNo column on all three lists, Pagination "Go to page N" jump (>7 pages),
  Postgres advisory lock guarding concurrent admin imports, per-job
  `JOB_IMPORTED` audit entry (enum migration `20260524180000_job_imported_action`)
  with one-off backfill script `prisma/backfill-job-imported.ts`, and
  `jobSourceLabel` portal-name fallback for imported rows.
- **Polish Round 2 (2026-05-25)** — sub-table pagination with namespaced
  query params (`?subs=` on jobs/candidates, `?ints=` on candidates,
  `?jobs=`/`?rsubs=`/`?rstatus=` on recruiters) reusing the existing
  `Pagination` component (now with an optional `paramKey` prop). Activity
  timeline became a Client Component that collapses to 5 by default and
  pages 20-at-a-time when expanded >30 entries; `getTimelineFor` capped at
  200 rows. Column pickers on `/candidates` + `/submissions` driven by a
  shared `src/components/ui/columns-menu.tsx` (drag-reorder + ↑/↓ keyboard
  buttons), replacing ~110 lines of duplication in `JobsTable`. Dialog
  focus trap + return-focus on close. Dashboard StatCard tooltips + Top-5
  source bucket + em-dash for zero-row recruiters. Reports gained a
  Joined % column per dimension. Manual job form parity for 7 nullable
  iLabor columns (positions, reqType, department, durationLabel, atsId,
  startDate, endDate) under a collapsible "More job details" section.
  `error.tsx` + `not-found.tsx` for the dashboard segment.
  Recruiter-detail status pill filter. Settings Admin Tools card.
  See commits 861c90f..e9d5652.
