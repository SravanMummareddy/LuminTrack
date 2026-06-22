# LuminTrack — Consolidated Audit Report

**Date:** 2026-05-26
**Branch:** `main` (with active uncommitted edits — see §Coverage)
**Reviewer:** Source-level multi-perspective audit (no fixes applied)

---

## 1. Audit Coverage

### Documents read
- `AGENTS.md`, `CLAUDE.md`
- `bugs.md` summary header (referenced via CLAUDE.md)
- `ENHANCEMENTS.md` (modified working-tree copy)
- `ILABOR_IMPORT_HANDOFF.md` (referenced)
- `CLAUDE_AUDIT_INSTRUCTIONS.md`
- `prisma/schema.prisma` + migration directory listing
- `package.json`
- Server actions: `auth`, `candidates`, `submissions`, `interviews`, `jobs`, `org`, `contacts`, `resumes`, `notes`, `users`, `ilabor-import`
- Selected queries: `reports`, `recruiters`
- Route files: `src/proxy.ts`, `src/app/(dashboard)/audit/page.tsx`
- Library: `src/lib/session.ts`, `src/lib/use-column-prefs.ts`, `src/components/settings/contacts-dialog.tsx`, `src/lib/validation/resume.ts`

### Skills considered
The audit instructions invited skill use; for this pass I executed reading +
`npm run lint` + `npm run build` directly in the main context. Specialized
gstack skills (`gsd-code-review`, `gsd-ui-review`, `verify`) were not invoked —
this is a single-pass source-evidence audit, not a multi-agent fan-out.

### Reviewers/perspectives executed
All 8 perspectives covered at source level: Senior Full-Stack, Database /
Data-Integrity, Security / Authorization, QA / Regression, UI/UX, Accessibility
(structural only — no rendered checks), Recruiting Operations, Adversarial.

### Routes inspected (from build output)
`/login`, `/`, `/audit`, `/candidates`, `/candidates/[id]`, `/candidates/[id]/edit`,
`/candidates/new`, `/jobs`, `/jobs/[id]`, `/jobs/[id]/edit`,
`/jobs/[id]/submissions/new`, `/jobs/import`, `/jobs/imports`, `/jobs/new`,
`/recruiters`, `/recruiters/[id]`, `/reports`, `/settings`, `/submissions`,
`/submissions/[id]`, `/submissions/[id]/edit`. `Proxy` middleware confirmed.

### Viewports tested
**None at runtime.** Responsive behavior was reviewed only from source — class
strings, breakpoint usage, and recent narrow-width hardening commits referenced
in `CLAUDE.md` (`3683f2f`, `596bd9b`).

### Commands executed
| Command | Result |
| --- | --- |
| `npm run lint` | ❌ Failed — 4 errors (`react-hooks/set-state-in-effect`) |
| `npm run build` | ✅ Succeeded (Next.js 16.2.6, Turbopack) |
| `git status` | Uncommitted edits detected (see below) |

### Playwright MCP
**Listed as deferred-tool-available but not invoked.** No dev server was
running, no DB credentials were exercised, and no Playwright session was
established in this pass. **Rendered workflow verification is therefore
blocked.** All UI/UX and workflow findings below are source-level and marked
*Needs Verification* where dynamic behavior is the load-bearing evidence.

### Limitations / blocked checks
- No live DB, no seed data, no rendered pages.
- No login session executed — all auth behavior assessed from source.
- iLabor import not exercised end-to-end (no sample JSON loaded).
- Browser console errors and visual regressions cannot be confirmed.
- Mobile (360px) and tablet viewports not actually rendered.

### Uncommitted changes detected
```
 M ENHANCEMENTS.md
 M src/app/(dashboard)/candidates/[id]/page.tsx
 M src/components/candidates/candidates-table.tsx
 M src/components/ui/field.tsx
 M src/components/ui/filter-bar.tsx
 M src/components/ui/pagination.tsx
?? CLAUDE_AUDIT_INSTRUCTIONS.md
?? "uploads/interview_list_candidate -bugs.png"
```
These were **not** judged as regressions. Findings drawn from these files are
flagged with the working-tree caveat.

---

## 2. Workflow Matrix

| Workflow | Steps exercised | UI reaction checked | Desktop/mobile | Persistence/history checked | Result | Related findings |
| --- | --- | --- | --- | --- | --- | --- |
| Auth — login / logout / route gate | Source only | n/a | source only | n/a | ⚠ Source-verified; no runtime | F-S1, F-S2 |
| Dashboard load + nav | Source | n/a | source only | n/a | ⚠ Not runtime-verified | — |
| Global search | Source (`queries/search.ts` listed; not opened) | n/a | n/a | n/a | ⚠ Not audited at depth | — |
| Candidate create / edit / status / tags / contacted | Source | source | source | source | ⚠ Needs runtime | F-Q1, F-D1 |
| Candidate resume library | Source | source | source | source | ⚠ Needs runtime | F-S3, F-Q2 |
| Job create / edit / status change | Source | source | source | source | ⚠ Needs runtime | F-Q3 |
| iLabor import preview + commit | Source | source | source | source | ⚠ Needs runtime | F-D2, F-P1 |
| Submission create / edit / duplicate override | Source | source | source | source | ⚠ Needs runtime | F-D3, F-Q4 |
| Submission status change (incl. JOIN/OFFER) | Source | source | source | source | ⚠ Needs runtime | **F-H1**, F-Q5 |
| Interview rounds add/edit/reschedule | Source | source | source | source | ⚠ Needs runtime | F-Q6 |
| Settings: users / clients / vendors / sources / contacts | Source | source | source | source | ⚠ Needs runtime | F-S4 |
| Notes (polymorphic) | Source | n/a | n/a | source | ⚠ Needs runtime | F-S5 |
| Activity/audit timeline + `/audit` page | Source | source | source | source | ⚠ Needs runtime | F-S6, F-Q7 |
| Reports: aging / pipeline / revenue / time-to-fill / time-in-stage | Source | n/a | source | n/a | ❌ **Confirmed correctness bug** | **F-H1** |
| Responsive sweep (1280 / 768 / 360) | Not rendered | — | — | — | ⛔ Blocked | F-A1 (structural) |

---

## 3. Findings

### Critical
*None confirmed at source.* Two High findings below have direct data-integrity
or correctness consequences but do not corrupt data — they produce wrong
reports.

### High

#### F-H1 — Time-in-stage and time-to-fill silently drop transitions to milestone statuses
- **Severity:** High
- **Category:** Reporting correctness / data integrity
- **Perspective:** DB engineer, Adversarial, Recruiting Ops
- **Confidence:** Confirmed (source evidence)
- **Workflow:** Reports — funnel velocity (§F2)
- **Files / lines:**
  - `src/server/queries/reports.ts:311-460` — only queries `Activity` rows where `action: "SUBMISSION_STATUS_CHANGED"`.
  - `src/server/actions/submissions.ts:333-344` — `changeSubmissionStatus` re-routes milestone transitions to specialized actions: `CANDIDATE_SELECTED`, `CANDIDATE_REJECTED`, `OFFER_RELEASED`, `OFFER_ACCEPTED`, `CANDIDATE_JOINED`. These are **not** logged as `SUBMISSION_STATUS_CHANGED`.
- **Actual:** The status walk in `reports.ts` (line 316) filters `action: "SUBMISSION_STATUS_CHANGED"`. Any submission that progresses past `CLIENT_INTERVIEW` to `SELECTED` / `OFFER_RELEASED` / `OFFER_ACCEPTED` / `REJECTED` / `JOINED` has no event in the result set for those transitions. The walk's "still sitting in current stage" branch then attributes the *entire* time since the last `SUBMISSION_STATUS_CHANGED` row to `CLIENT_INTERVIEW` (or whichever was last), inflating that bucket and zeroing the milestone buckets.
- **Expected:** Median/p90 days in `SELECTED`, `OFFER_RELEASED`, `OFFER_ACCEPTED` should reflect real dwell time; time-to-fill should pick up `CANDIDATE_JOINED` rows when `actualJoinDate` is absent.
- **Impact:** Recruiter performance and funnel-velocity dashboards are misleading. Decisions about pipeline health (where deals stall) are made on inflated `CLIENT_INTERVIEW` numbers and absent late-stage numbers. Time-to-fill fallback path at `reports.ts:352-355` is also broken for the same reason (looks for `newValue === JOINED_LABEL` on `SUBMISSION_STATUS_CHANGED`, but `JOINED` is logged as `CANDIDATE_JOINED`).
- **Evidence:** Cross-file (`reports.ts` filter + `submissions.ts` action selection).
- **Fix direction:** Either (a) broaden the audit query to include the milestone actions (`CANDIDATE_SELECTED`, `CANDIDATE_REJECTED`, `OFFER_RELEASED`, `OFFER_ACCEPTED`, `CANDIDATE_JOINED`) and synthesize `oldValue`/`newValue` for them, or (b) write a parallel `SUBMISSION_STATUS_CHANGED` row in addition to the milestone action so the audit trail has both. (a) keeps the audit clean; (b) preserves the human-readable milestone log.
- **Regression test:** Playwright scenario — seed a submission, walk it `SUBMITTED → … → CLIENT_INTERVIEW → SELECTED → OFFER_RELEASED → OFFER_ACCEPTED → JOINED` over distinct timestamps, assert that `/reports` time-in-stage shows non-zero medians for SELECTED / OFFER_RELEASED / OFFER_ACCEPTED and that time-to-fill counts the submission.

#### F-H2 — `npm run lint` fails on `main`
- **Severity:** High (CI gating risk; possible hidden React 19 bugs)
- **Category:** Build/CI / React correctness
- **Perspective:** Senior FS, QA
- **Confidence:** Confirmed (`npm run lint` output)
- **Files / lines (all `react-hooks/set-state-in-effect`):**
  - `src/components/candidates/candidates-table.tsx:72` *(working-tree modified; could be in-progress)*
  - `src/components/settings/contacts-dialog.tsx:48`
  - `src/components/ui/filter-bar.tsx` (per lint summary — exact line not opened)
  - `src/lib/use-column-prefs.ts:42`
- **Actual:** ESLint 9 emits `Calling setState() directly within an effect`. React 19 / Next 16 surface this rule as `error`. Build still passes (Next does not run ESLint as a hard gate by default in 16), but any CI that runs `npm run lint` (or `next lint` if added) will fail.
- **Impact:** Cascading re-renders on dialog open/close (contacts-dialog) and on every column-prefs hydration. Probably unobservable in 8-person dev usage; would surface as flicker or input-blur regressions under React's concurrent rendering.
- **Fix direction:** Each case can be resolved with one of:
  - Replace the effect with derived state / `useMemo`.
  - Move the setState into the event handler that opens/closes the dialog.
  - Read localStorage during `useState` initializer with a SSR guard (`typeof window !== "undefined"`) and drop the hydration effect — note this changes the hydration-mismatch tradeoff already documented in `use-column-prefs.ts`.
- **Regression test:** Add `npm run lint` to CI; assert exit 0.

### Medium

#### F-D1 — Duplicate-named migration directories with sequencing dependency
- **Severity:** Medium
- **Category:** Database / migration hygiene
- **Confidence:** Confirmed
- **Files:**
  - `prisma/migrations/20260526125901_candidate_status_tags_contact_source/migration.sql` — guarded `DROP DEFAULT` on `Candidate.tags` / `featuredSkills` (columns don't yet exist on fresh DB).
  - `prisma/migrations/20260526140000_candidate_status_tags_contact_source/migration.sql` — actually creates those columns.
  - `prisma/migrations/20260526145000_restore_array_defaults/migration.sql` — restores the defaults.
- **Actual:** Two migrations share the same human-readable name; the earlier one's SQL is guarded so it no-ops on a fresh DB but is a real diff on the developer's local DB where columns already existed pre-rename. The chain `125901` → `140000` → `145000` (drop default → create with default → restore default) is correct on a clean DB but is confusing and brittle.
- **Impact:** A future contributor inspecting `prisma migrate status` sees two identically-named migrations and may collapse / squash incorrectly. Shadow-DB replay for `migrate dev` works today only because of the `IF EXISTS` guard in the earlier file.
- **Fix direction:** Rename the earlier migration to describe what it actually does (`drop_candidate_array_defaults_legacy`). Consider squashing the trio into a single named migration via `prisma migrate diff` once everyone's local DB is in sync. Do **not** modify migration filenames on already-deployed environments without coordinated `_prisma_migrations` table maintenance.

#### F-D2 — iLabor importer re-points `clientId` / `vendorId` silently on customer-name change
- **Severity:** Medium
- **Category:** Data integrity / audit completeness
- **Confidence:** Confirmed
- **Files:** `src/server/actions/ilabor-import.ts:434-490`
- **Actual:** When a re-import row has a `customerName` (or `clientName`) that doesn't match the previously-stored value, the job's `clientId` / `vendorId` are overwritten to the upserted-by-name target. No audit row records the relationship change; only `REQUISITIONS_IMPORTED` (batch-level) is written.
- **Impact:** If iLabor renames a customer or splits it (e.g. "Acme Corp" → "Acme Inc"), every existing imported req silently jumps to the new Client row. Historical reports filtered by client lose accurate counts and there's no audit trail to reconstruct the move.
- **Fix direction:** Detect `clientId`/`vendorId` change inside the per-row loop and emit a `JOB_UPDATED` audit row alongside the upsert.

#### F-D3 — Duplicate-submission check is non-atomic
- **Severity:** Medium
- **Category:** Concurrency
- **Confidence:** Confirmed (code shape)
- **Files:** `src/server/actions/submissions.ts:71-80, 99-153`
- **Actual:** `prisma.submission.findFirst(...)` runs *outside* the transaction that subsequently creates the submission. Two simultaneous form submits for the same `(candidateId, jobId)` can both see "no existing" and both create rows — the `@@unique([candidateId, jobId])` DB constraint was intentionally dropped in `20260526150000_interview_tz_and_dup_override` for §C4 (override-with-reason).
- **Impact:** Low real-world impact (small team, recruiter wouldn't double-submit on purpose), but the override-reason workflow can be defeated by racing. Two duplicate rows can both be created without either carrying a `duplicateReason`.
- **Fix direction:** Move the `findFirst` inside the `$transaction` and use `SELECT ... FOR UPDATE` via `tx.$queryRaw` on a single-row lock keyed by `(candidateId, jobId)`, or use a Postgres advisory lock keyed on a hash of those two ids the same way the importer locks. Alternatively, keep the unique constraint and use `duplicateReason` as a tiebreaker by including it in the unique-key surface.

#### F-Q5 — `changeSubmissionStatus` silently no-ops on validation failure
- **Severity:** Medium
- **Category:** UX / error visibility
- **Confidence:** Confirmed
- **Files:** `src/server/actions/submissions.ts:304-316`
- **Actual:** Action is `Promise<void>`, returns silently when `statusChangeSchema` fails, when the status equals current, or when submission is missing. No `revalidatePath` runs in those cases, so the user sees no feedback at all — the modal closes (assumed) and nothing happens. A recruiter who set an invalid `expectedJoinDate` for `OFFER_ACCEPTED` would not know why the status didn't change.
- **Fix direction:** Convert to `FormState`-returning action and surface field errors in the dialog, matching the pattern in `updateSubmission`.

#### F-S1 — No rate limiting on login
- **Severity:** Medium
- **Category:** Security
- **Confidence:** Confirmed
- **Files:** `src/server/actions/auth.ts:15-42`
- **Actual:** `loginAction` performs `prisma.user.findUnique` and `verifyPassword` with no throttle, lockout, or IP-based rate limit. Bcrypt cost is the only friction.
- **Impact:** Brute-force is bounded by bcrypt CPU but still ~10–50 attempts/sec on a Vercel function with default cost. Small team app, but credential stuffing from leaked passwords is the realistic threat.
- **Fix direction:** Add per-IP and per-email rate limit (Vercel KV equivalent via Marketplace, or `@upstash/ratelimit`). Lockout after N failed attempts with a backoff.

#### F-S2 — Session middleware fetches every request; no caching on token verification
- **Severity:** Medium-Low
- **Category:** Performance / security defense-in-depth
- **Confidence:** Confirmed
- **Files:** `src/proxy.ts:22-23`, `src/lib/session.ts:33-44`
- **Actual:** `proxy.ts` runs `verifySessionToken` (jose) per matched request. `getCurrentUser` then re-verifies the token and reads `user` from DB. Two Argon/jose verifies and one Prisma query per page. `cache()` only memoizes within a single React render — not across requests.
- **Impact:** Latency cost (small) and an extra DB round-trip on every navigation. Not a security bug; flagged because it makes session-related slowness hard to diagnose.
- **Fix direction:** Cache `verifySessionToken` outcome in middleware via `nextUrl.searchParams` is wrong — token is the source of truth. Acceptable as-is; document the cost.

#### F-S3 — `driveLink` accepts any URL (no Drive domain allowlist)
- **Severity:** Medium-Low
- **Category:** Security (link spoofing) / UX
- **Confidence:** Confirmed
- **Files:** `src/lib/validation/resume.ts:6-8` (`z.url(...)`).
- **Actual:** Any HTTP(S) URL passes. A recruiter (or attacker who phishes a recruiter's session) could store `https://evil.example/payload.exe` as a "résumé" and have other recruiters click it when reviewing submissions. The UI is documented to do an "inline preview" via iframe — embedding a hostile URL would also run JS in the LuminTrack origin only if a sandbox is missing (not verified, page not opened).
- **Fix direction:** Restrict accepted schemes/domains to `drive.google.com`, `docs.google.com`, etc. via a custom Zod refinement. Render the preview iframe with `sandbox="allow-scripts allow-same-origin"` removed (or use a server-side rewrite).

#### F-S4 — Per-record authorization not enforced on most write actions
- **Severity:** Medium
- **Category:** Authorization
- **Confidence:** Confirmed
- **Files:** Multiple
  - `src/server/actions/submissions.ts:updateSubmission` — any active user.
  - `src/server/actions/submissions.ts:changeSubmissionStatus` — any active user.
  - `src/server/actions/resumes.ts:deleteCandidateResume` — any active user, no candidate-ownership check.
  - `src/server/actions/jobs.ts:changeJobStatus` / `updateJob` — any active user.
  - `src/server/actions/candidates.ts:updateCandidate` / `markCandidateContacted` — any active user.
- **Actual:** Only org/user/contact writes are admin-gated (`org.ts:25-30`, `users.ts:16-17`, `contacts.ts:45-49`). All candidate/job/submission/resume mutations accept any signed-in recruiter.
- **Impact:** Per the project notes (`<10 recruiters`, "internal" tool) this may be intentional — every recruiter sees and edits everything. Flagging because:
  - There is no documented decision that "any recruiter may delete any other recruiter's saved résumés" — this is the most disruptive of the gaps.
  - The audit row records `performedById`, so blame is traceable, but recovery requires a backup.
- **Fix direction:** Decision-point. If intentional, add a doc note to `CLAUDE.md`. If not, gate writes with either "created the record" or "assigned to the job" ownership checks.

#### F-S5 — `createNote` does not verify the entity exists / belongs to a viewable scope
- **Severity:** Low-Medium
- **Category:** Authorization / data integrity
- **Confidence:** Confirmed
- **Files:** `src/server/actions/notes.ts:11-65`
- **Actual:** The action accepts any `entityType` + `entityId` from the form. If the user crafts a request with a valid CUID for an entity they don't normally see, a note is created against it. No `findUnique` to assert the entity exists. The polymorphic FK is set but no parent existence is checked — an invalid `entityId` will fail at FK insert (so existence is enforced by the DB), but the `EntityType` discriminator could mismatch the FK (e.g. `entityType=SUBMISSION` with `entityId` pointing at a Candidate id whose collision-resistant cuid happens to match — astronomically unlikely but logically possible).
- **Fix direction:** Pre-fetch the entity by `entityType`/`entityId` and bail with `error: "Entity not found."` before writing.

#### F-Q1 — `featuredSkills` subset enforcement only at Zod layer
- **Severity:** Low-Medium
- **Category:** Data integrity
- **Confidence:** Inferred from schema + action (schema validator file not opened)
- **Files:** `prisma/schema.prisma:325` ("Subset of `skills` (enforced in Zod, not at the DB level)"), `src/server/actions/candidates.ts:46`.
- **Actual:** A handcrafted form post can include `featuredSkills` values not present in `skills`. The DB has no check. Display layer caps at 3 chips so visual fallout is small.
- **Fix direction:** Enforce subset in the action (post-parse, before write): `if (!d.featuredSkills.every(s => d.skills.includes(s))) return fieldErrors`.

#### F-Q2 — Editing a `CandidateResume.driveLink` doesn't update past submissions but the audit only mentions "updated"
- **Severity:** Low
- **Category:** UX / audit clarity
- **Files:** `src/server/actions/resumes.ts:61-102`
- **Actual:** Code comment correctly notes "The change does not re-sync past submissions" but the activity row text says `Resume "X" updated` without telling the reader that submissions still show the old snapshot. Easy source of operator confusion when a recruiter edits a Drive link and then can't understand why an older submission still opens the old link.
- **Fix direction:** Mention "(past submissions still use the previous link)" in the audit description, or in the resume-edit form UI.

### Low

#### F-Q3 — `Job.status` re-import preservation is silent
- **Severity:** Low
- **Category:** UX / operator surprise
- **Files:** `src/server/actions/ilabor-import.ts:208-237`
- **Actual:** `jobUpdateFields` deliberately omits `status` from the update set so a hand-edited status survives a re-import. `externalStatusRaw` still refreshes. There is no warning in the importer preview that the iLabor portal's current status differs from LuminTrack's. Per the project notes this is intentional, but a user reviewing the preview sees no signal that "iLabor says CLOSED, LuminTrack will stay OPEN".
- **Fix direction:** Add a per-row "status diverged" badge to the importer preview's updated-rows table.

#### F-Q4 — `submittedAt` is editable on `updateSubmission`
- **Severity:** Low
- **Category:** Audit integrity
- **Files:** `src/server/actions/submissions.ts:268-289`
- **Actual:** Updating a submission allows backdating `submittedAt`. The audit logs "submitted date" as a changed field but does not record old/new values explicitly (only the change-set label). Reports keyed on `submittedAt` (recruiter aging, time-to-fill anchor) can be retroactively manipulated.
- **Fix direction:** Either disallow editing `submittedAt`, or include `oldValue`/`newValue` ISO timestamps on the audit row, or require admin role.

#### F-Q6 — Interview round delete path not present
- **Severity:** Low (possible enhancement)
- **Category:** Workflow completeness
- **Files:** `src/server/actions/interviews.ts` — only `createInterviewRound` and `updateInterviewRound` exported.
- **Actual:** No `deleteInterviewRound` action. If a round is added by mistake, the only recovery is editing it (no row-removal). Per the project's "no hard deletes" principle this may be intentional, but a round mistakenly added to the wrong submission cannot be retracted.
- **Fix direction:** Soft-delete flag on `InterviewRound`, or an admin-only delete action.

#### F-Q7 — `/audit` page filters cast `actionFilter` without enum validation
- **Severity:** Low
- **Category:** Robustness
- **Files:** `src/app/(dashboard)/audit/page.tsx:35-40`
- **Actual:** `action: actionFilter as keyof typeof ActivityAction` — if a user crafts `?action=BOGUS` the Prisma query throws (returns a 500). Mitigated by the `<select>` UI but trivially bypassable via URL editing.
- **Fix direction:** Validate `actionFilter` against `Object.values(ActivityAction)` before assigning into `where`.

#### F-S6 — `Activity` rows lose old/new for milestone status transitions
- **Severity:** Low (consistency)
- **Category:** Audit completeness
- **Files:** `src/server/actions/submissions.ts:333-378`
- **Actual:** Milestone transitions (CANDIDATE_SELECTED, etc.) call `logActivity` with `oldValue`/`newValue` set to the human label, **but** when reading the timeline UI, the action enum is what's displayed prominently. Cross-references: `F-H1` (this is the same root cause manifesting in the reports query). Documented separately because the user-facing timeline also lacks an obvious "X → Y" arrow for milestone rows.

### UI/UX and Accessibility Improvements

> *All of these are source-only observations. Mark every one **Needs
> Verification** at the rendered level.*

#### F-A1 — `useEffect` in `contacts-dialog.tsx` re-runs on `parentId` even when dialog closed
- **Category:** A11y / focus, perceived behavior
- **Files:** `src/components/settings/contacts-dialog.tsx:46-49`
- **Observation:** Same as lint finding F-H2 — clearing `editing` on close is correct, but dependency on `parentId` means switching dialogs while one is mid-edit silently discards the form without warning. Recommend an "unsaved changes" guard.

#### F-A2 — `meetingLink` rendered without `rel="noopener noreferrer"` enforcement audited
- **Category:** Security/A11y
- **Observation:** Not opened in this pass. If the `Join` link target is `_blank`, ensure `rel="noopener noreferrer"`. Otherwise the target page can `window.opener.location = ...` against a phishing URL.

#### F-A3 — Audit-log table cells use `<Td label="…">` pattern — confirm mobile stacking works
- **Category:** A11y, responsive
- **Files:** `src/app/(dashboard)/audit/page.tsx:160-186`
- **Observation:** Pattern relies on the `Td` component to swap to a labelled-stack on narrow viewports. Not rendered in this pass — verify with Playwright at 360px.

#### F-A4 — `<select>` filter form on `/audit` posts via GET (no `method`); confirm SR labels
- Already labelled with `<label htmlFor=…>`. Source looks fine; verify focus order and the "Clear" link's tab position.

#### F-A5 — Inline-preview iframe (résumé) sandboxing
- **Files:** Not opened in this pass — but called out by F-S3.
- **Observation:** If the candidate detail page embeds the Drive link in an `<iframe>`, ensure `sandbox` attribute is restrictive and `referrerPolicy="no-referrer"`. (Needs rendering to confirm.)

### Test Coverage Gaps
- No `tests` / `__tests__` directories present (per `package.json` — no `test` script). The medium-bug sweep history in CLAUDE.md indicates manual + Playwright-MCP verification only.
- **Recommended additions** (Playwright MCP scenarios — no need to introduce Jest/Vitest):
  1. Auth happy/sad path + middleware redirect.
  2. Candidate create with duplicate-email confirm flow.
  3. Submission create with same-(candidate, job) override flow.
  4. Submission status walk through every transition, including milestone actions; assert reports counts after.
  5. iLabor import preview with raw envelope + with extension envelope; confirm advisory-lock rejection of a second concurrent submit.
  6. `/audit` filter URL tampering (action=BOGUS).
  7. Resume library: add, edit, delete; verify past submission still resolves its snapshot.
  8. Narrow-width (360px) snapshot of: candidate interview-history, jobs table, submissions table, dashboard, reports.

---

## 4. Cross-Workflow Consistency Review

- **List vs. detail:** Candidate list shows `featuredSkills` truncated to 3 with `+N` tooltip (per CLAUDE.md), detail shows full `skills` array. Source consistent; rendered consistency not verified.
- **Candidate / job / submission triangle:** Each mutating action revalidates the other two paths (e.g. `submissions.ts:156-158` revalidates `/submissions`, `/jobs/:id`, `/candidates/:id`). Consistent. `interviews.ts` only revalidates the submission detail, **not** the candidate detail — the candidate's grouped interview history relies on the candidate page being requested fresh; with Next 16 RSC defaults this is usually fine but means an in-place candidate-page tab won't auto-refresh after an interview update. **Needs verification.**
- **Activity vs. current state:** **F-H1 / F-S6** — milestone status transitions are logged with milestone actions, not `SUBMISSION_STATUS_CHANGED`. The reports query only reads the latter, so audit-derived analytics and the actual `Submission.status` disagree by construction for any submission past `CLIENT_INTERVIEW`.
- **Analytics vs. records:** Time-in-stage inflates `CLIENT_INTERVIEW` (or whichever was last logged as `SUBMISSION_STATUS_CHANGED`) and zeroes `SELECTED` / `OFFER_RELEASED` / `OFFER_ACCEPTED`. Records are correct; reports are not.
- **Imported vs. manual:** Imported jobs preserve their `status` on re-import; manually-edited jobs don't have an "external status" to display. Source-consistent. F-D2 surfaces the silent client/vendor re-pointing.
- **Desktop vs. mobile:** Not rendered — listed as a blocked check.

---

## 5. Prioritized Fix Roadmap

### Fix immediately
1. **F-H1** — Reports time-in-stage / time-to-fill broken for milestone statuses. Single-query fix in `reports.ts`; regression-test `/reports` after.
2. **F-H2** — 4 lint errors. Each is mechanical; group with F-A1 (contacts-dialog discard guard).
   - *Order concern:* The candidates-table change at line 72 is in the working tree — coordinate with whoever has those uncommitted edits before pushing.

### Fix next
3. **F-D2** — Audit-log client/vendor re-pointing in the importer.
4. **F-D3** — Atomic duplicate check in `createSubmission` (advisory lock or `FOR UPDATE`).
5. **F-Q5** — Return `FormState` from `changeSubmissionStatus`.
6. **F-S1** — Login rate limit.
7. **F-S3** — Drive-domain allowlist on `driveLink`.
8. **F-Q7** — Validate `?action=` against the enum on `/audit`.

### Design/product decision needed
9. **F-S4** — Per-record authorization. Either document "any recruiter may edit anything" intentionally or scope writes to owner/assignee.
10. **F-Q4** — Allow recruiters to backdate `submittedAt`? If yes, log old/new explicitly. If no, lock the field.
11. **F-Q6** — Add a delete or soft-delete path for interview rounds?
12. **F-D1** — Squash / rename the two `candidate_status_tags_contact_source` migrations once all environments are in sync.

### Verify further before changing code
13. **F-A1, F-A2, F-A3, F-A5** — Render at 360 / 1280 px under Playwright MCP; check focus order, link `rel`, iframe sandbox attrs.
14. **F-S2** — Measure middleware + session cost in production logs before optimizing.
15. **F-Q2** — Confirm with users whether résumé-edit propagation to past submissions is desired.

### Regression coverage required after fixes
- After **F-H1**: full reports page + a seeded submission progressed through every status.
- After **F-D2**/F-D3: re-import of a customer-rename scenario; concurrent submission attempts.
- After **F-S1**/F-S3/F-Q7: auth brute-force test; resume-link rejection of non-Drive URLs; audit URL fuzz.
- After **F-H2**: full lint pass green; manual smoke of contacts dialog, candidates table column reorder, filter bar.

---

*End of report. No source files were modified by this audit.*
