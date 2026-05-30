# Round 5 — Submission & Workflow UX testing findings

**Branch:** `round5-submission-workflow-overhaul` (not merged to main)
**Method:** Claude in Chrome — live app, persona-driven (recruiter + admin),
screenshots at each step. Each step evaluated for (1) correctness and
(2) UX / workflow quality.
**Started:** 2026-05-29 · logged in as **Nina Alvarez (Administrator)**

> Findings are appended live as testing proceeds, so nothing is lost on /clear.
> Severity: 🔴 blocker · 🟠 should-fix · 🟡 nice-to-have · ✅ works well

---

## Test environment
- Dev server: `npm run dev` on **localhost:3000** (background). NOTE: action
  latency is highly variable (2–10s/action) on this Neon-serverless dev setup.
- Data: existing DB (NOT re-seeded this session).
- A leftover tab from a prior session was on **localhost:4321** (different
  server instance) — ignored; testing done on :3000.

## ⚠️ Test-data mutations made during this session (so they're not mistaken for prod state)
- SUB-312 (Priscilla Nguyen / QA Automation Engineer) advanced
  Submitted → Resume Picked → Vendor Screening Call → Client Interview →
  Selected → **Joined**. The JOINED step auto-created **Placement PLC-002**
  and flipped candidate Priscilla Nguyen to **PLACED**. Reversible (revert
  JOINED → placement TERMINATED) if you want the demo data restored.
- SUB-191 (Priscilla Wang) advanced Resume Picked → Vendor Screening Call.

---

## Findings log

### ✅ FIXED (2026-05-29) — submission selects reset to first-option after a gate; "Submitted by" silently mis-attributed
**Fix applied** in `src/components/submissions/submission-form.tsx`, verified live:
1. Added a hidden `<input name="submittedById" value={fields.submittedById}>`
   and removed `name` from the visible "Submitted by" `<select>` (now
   presentational), mirroring the existing jobId/candidateId pattern — the
   submitted recruiter can no longer diverge from state. Verified: post-gate
   FormData `submittedById` = Daniel Okafor (the chosen one), exactly 1 entry.
2. Added a `selectSyncKey` bumped in a `useEffect([state])` and used as a `key`
   on all selects (job, candidate, submittedById, résumé, override-reason) so
   they remount and re-apply their controlled value AFTER React 19's
   post-action form reset. (The bump must be in an effect, not render-time —
   the reset fires after commit and would clobber a render-time re-key; a scoped
   `eslint-disable-next-line react-hooks/set-state-in-effect` documents why.)
   Verified: post-gate the selects display iOS Developer / Priscilla Wang /
   Daniel Okafor correctly.
- Regression: `tsc --noEmit` clean, `eslint` clean.

---

### (original report) 🔴 BUG — submission selects reset to first-option after a gate; "Submitted by" is silently mis-attributed
**Where:** `src/components/submissions/submission-form.tsx` (all 3 entry points;
any gate: duplicate / iLabor / not-assigned).
**Repro:** open `/submissions/new`, pick Job = iOS Developer — Apple, Candidate =
Priscilla Wang (already on that job) as admin Nina Alvarez → Submit → duplicate
gate appears.
**Observed:** after the gate re-render, the Job / Candidate / Submitted-by selects
all visually snap to their FIRST option (Business Analyst / Anita Mwangi /
Aisha Khan), even though the gate text correctly says "Priscilla Wang".
**Proven via live FormData (non-destructive read, did NOT submit):**
`jobId`=iOS ✅, `candidateId`=Priscilla Wang ✅ (both saved by hidden inputs),
`candidateRate`=66 ✅, but **`submittedById`=Aisha Khan ❌** (intended Nina Alvarez).
**Impact:**
- 🔴 *Functional / data correctness:* `submittedById` is a `name`-bearing
  `<select>` with NO hidden-input backstop, so "Submit anyway" attributes the
  submission to the wrong recruiter — silently. A real user defaulting to
  themselves would have the submission logged under the first recruiter instead.
- 🟠 *Confusing display:* Job/Candidate selects show the wrong person/job (they
  still submit correctly via hidden inputs, but the user sees a mismatch vs the
  gate message and may distrust or cancel).
**Root cause:** React 19 auto-resets the form after a `<form action>` completes.
The component controls inputs to survive this (comment at submission-form.tsx:86),
which works for `<input>` (rate kept "66") but NOT for controlled `<select>`:
`form.reset()` snaps a select to its first option and React skips re-applying
because its `value` prop is unchanged.
**Suggested fix:** mirror the jobId/candidateId pattern for submittedById — make
the visible select presentational (drop its `name`) and add
`<input type="hidden" name="submittedById" value={fields.submittedById} />`;
and/or force the selects to re-sync after a gate (e.g. remount via a key tied to
a gate nonce) so the *display* also matches state. Résumé select also visually
resets but submits correctly (résumé uses hidden `resumeChoice`/`candidateResumeId`).


### Phase 4 — Submissions list upgrades  (task #1)
- ✅ **Days-in-stage column** present and sortable.
  - 🟡 Could NOT verify the **amber >7d highlight** — all current rows show
    0d–1d (data is recent / sorted newest-first). Need an older/stale row to
    confirm the amber styling actually triggers. TODO: sort ascending or use
    a seeded stale submission.
- ✅ **S.No hidden by default** — "Showing 10 of 11 columns", ID column leads.
- ✅ **Inline status edit** (the headline list feature) works end-to-end:
  clicking the ▼ on a status badge opens a branded "Update status" modal with
  status select + Note; selecting **Rejected/On Hold** correctly reveals the
  optional **Reason** preset dropdown; "Updating…" pending state shows;
  change persists and the list refreshes; success toast fires (see Toasts).
- ✅ **"Mine, stale >7d"** quick-filter chip present. NOT yet exercised (need
  to confirm it actually filters to current user's stale subs).
- ✅ **Columns** menu present. NOT yet opened to confirm S.No is available there.
- 🟡 **Minor UX note:** in the submissions list the **Candidate name links to
  the submission detail** (`/submissions/{id}`), not the candidate profile.
  Reasonable for a submissions list, but mildly surprising — a user may expect
  a person's name to open the person. Consider a separate affordance or tooltip.

### Phase 3 — Toasts on silent saves  (task #4)
**RESULT: toasts WORK.** Important process note: my first ~3 status-change
tests showed no toast and I nearly logged it as a bug. Root cause was NOT a
bug — it was capture timing: the 4s toast window + slow/variable dev-server
latency + intermittent tooling delays meant screenshots kept landing after the
toast auto-dismissed. Confirmed by temporarily bumping `SUCCESS_MS` to 60s in
`src/components/ui/toast.tsx` (since **reverted** — working tree clean), which
made every toast appear reliably.
- ✅ **Inline status cell** → "Status updated to Vendor Screening Call" (green, check icon, bottom-right).
- ✅ **Detail-page status form** → "Status updated to Selected".
- ✅ **JOINED → placement cascade** (the #1 silent-save complaint) →
  two-line toast: "Status updated to Joined" / "Placement **PLC-002** created
  — set its rates next." Names the placement and prompts the next action. 👍
- ⏳ Still to verify: **note-added** toast, **job-status-change** toast, and
  that NO toast appears on the unauthenticated login page.

### Phase 3 — Branded confirm dialogs  (task #5)
- ✅ **Résumé delete** → branded `ConfirmDialog` ("Delete resume?") with a
  context-aware body ("'General' is used by 1 submission — each keeps its own
  copy of the link, so they're unaffected") + Cancel / Delete. NOT native
  window.confirm. Cancel closes cleanly with no deletion.
- Document / interview-round / contact deletes share the same `ConfirmDialog`
  primitive (not individually re-tested). Known deferral: the 2 contacts-dialog
  "discard unsaved changes" prompts remain native window.confirm.

### Phase 5a — Admin re-attribution of submittedById  (task #6)
- ✅ Edit submission page (admin) shows an editable **"Submitted by"** select
  with helper "Admin: correct who this submission is credited to." Candidate +
  Job are read-only (fixed at creation). Recruiter-side absence still to verify.
- 🟠 **FOLLOW-UP / likely same bug:** `submission-edit-form.tsx` has the same
  controlled, name-bearing "Submitted by" + "Resume" selects. It redirects on
  success (safe), BUT on a validation-error re-render (no redirect) it would hit
  the identical React-19 form-reset → submittedById mis-attribution + selects
  showing wrong values. Apply the same fix (hidden-input backstop + remount key)
  there. Also worth scanning the status forms, though those are single-select.

### Phase 2 / R4.2 — Candidate lifecycle cascade (incidental, confirmed)
- ✅ After the JOINED test, Priscilla Nguyen's candidate page shows **Active +
  Placed** badges and a **"CURRENTLY PLACED → PLC-002 — QA Automation Engineer
  · Boeing"** card. End-to-end JOINED → placement → candidate-PLACED cascade
  works and is surfaced where expected.
- ✅ **"Submit to a job"** button present on the candidate header (candidate-
  locked entry point #2 exists).

### Status pipeline / detail page (incidental observations)
- ✅ Detail page has a clear **status pipeline stepper** (✓ completed, numbered
  current, horizontal scroll for later stages).
- ✅ **"Effective date/time"** label + (i) tooltip present (Phase 5c relabel),
  with helper text "To correct the original submitted date… use Edit submission."
- 🟡 **Résumé preview** on submission detail shows Google Drive
  "Sorry, the file you have requested does not exist." — this is the **seed
  data's placeholder Drive links**, not a code bug. Flagging only so demo data
  is cleaned up before any live demo.

### Environment / dev-only noise (not user-facing bugs)
- Hydration mismatch warning in dev caused by `data-scribe-recorder-ready`
  (injected by a browser extension), not app code.
- Recharts "width(-1)/height(-1)" warnings — a chart renders in a zero-size
  container at some point. Minor; worth a look but not user-visible.

---

## Test status tracker

### ✅ Tested & passing (admin persona)
- [x] Inline status editor (modal, reason-on-reject, pending state, persists)
- [x] Days-in-stage column present + sortable; S.No hidden by default
- [x] Toasts: inline cell, detail-page form, JOINED→placement cascade (names PLC)
- [x] Duplicate gate (concrete message, "view existing" link, preset reason + note)
- [x] Rate-prefill hint; "Effective date/time" relabel + tooltip
- [x] Open-mode + candidate-locked entry points exist & render correctly
- [x] Branded confirm dialog (résumé delete; others share the primitive)
- [x] Admin re-attribution field present on edit form (admin)
- [x] Candidate lifecycle cascade (JOINED → PLC-002 → candidate PLACED) surfaced

### ✅ Found & fixed
- [x] **submittedById mis-attribution + select-reset after gate** — fixed,
  verified, committed `dc0fe1d` (see top of this file).

### ⏳ Still to test
- [ ] "Mine, stale >7d" filter actually filters; amber >7d highlight; Columns menu contents
- [ ] Note-added toast; job-status-change toast; no-toast on login page
- [ ] **job-locked** entry point (from a job page) renders job fixed + candidate picker
- [ ] iLabor **closed / cap** soft gates (need a job with ilaborSubmitOpen=0 / at submitLimit)
- [ ] Confirm dialogs for document / interview-round / contact deletes (résumé done)
- [ ] Re-attribution field correctly **absent for recruiters** (needs recruiter login)
- [ ] **Assignment gate + self-claim as a RECRUITER** (headline; needs recruiter login)
- [ ] **Edit-form same-bug follow-up** — apply submittedById fix to `submission-edit-form.tsx`
- [ ] Regression: old job-status form path (tsc + lint already clean for the fix)

### ✅ iLabor import scenarios — VERIFIED LIVE (2026-05-29, admin)
Uploaded `uploads/ilabor_data_sample.json` (raw capture) → Preview:
- ✅ **Envelope check PASSED** — no error. The tolerant adapter
  (`ilabor-import.ts:154-170`) wraps a raw `{requisitionViewList}` capture
  (no `source` key) into the extension envelope. **The `json upload error.png`
  screenshot is STALE** — it predates that adapter (Phase 4 polish). Current
  behavior accepts raw captures, as CLAUDE.md claims.
- ✅ **Preview = 305 NEW / 0 UPDATED / 1 ERRORED / 0 UNMAPPED** — matches the
  exact code+data prediction. The 1 skip is row #71 (req 158969 "Zscaler
  Engineer"), `customerName` empty in the source → **correct** validation skip,
  not a bug. The other 305 import.
- ✅ Preview also warns "will create 1 new vendor (RANDSTAD) and 79 new clients"
  with rename guidance (rename in Settings first so jobs stay linked) — good guard.
- ✅ **CONFIRMED import (owner approved):** "Import complete — Created 305 ·
  Updated 0 · Unchanged 0 · Skipped 1". DB verified: Job count 50→355, 79 new
  clients + RANDSTAD vendor created. Success card links to the run's change log.

### 🔴 PERF / PRODUCTION RISK — 305-row import took 11.3 minutes
Dev server log: `POST /jobs/import 200 in 11.3min … importRequisitions … in
677459ms`. The import is functionally correct but **extremely slow**: the
per-row mini-transaction design (one `$transaction([job.upsert, audit])` per row
+ ~80 entity resolves, all sequential round-trips to Neon serverless) means 305
rows = ~11 min here.
- **Why it matters:** on Vercel, Server Actions run as serverless functions with
  a `maxDuration` cap (Hobby 60s; Pro default ~15s, max 300s; Enterprise max
  900s). A 677s execution **exceeds the Pro 300s limit** — a 305-row import would
  be **killed mid-run in production**, leaving a partial import (per-row commits
  persist, so no rollback). The current design only "works" locally because dev
  has no function timeout.
- **Context:** this slowness is the flip side of the earlier fix that split the
  single 60s `$transaction` into per-row transactions to dodge the Postgres
  "expired transaction" error (see DEVLOG). It traded the transaction timeout for
  a very long total request.
- **Suggested fix:** batch the writes — `prisma.createMany` for jobs +
  `createMany` for audit rows in chunks (e.g. 50/chunk), or move the import to a
  background job / queue and stream progress. Either keeps each DB round-trip
  count low instead of 305 sequential ones. Needs a follow-up ticket.
- Caveat: today's dev server was unusually slow across the board (status changes
  took 5–7s each), so prod might be 2–4 min rather than 11 — but that still
  exceeds Hobby's 60s and risks Pro's 300s. Worth load-testing before relying on
  large imports in prod.

### (original to-do, now resolved above) iLabor import scenarios — from `uploads/` (admin only)
Source file: `uploads/ilabor_data_sample.json` — a RAW iLabor API response
(top-level `requisitionViewList`, 306 rows; no `source:"lumintrack-labor-extension"`
envelope). Two user-captured screenshots in `uploads/` show what to investigate:
- [ ] **`json upload error.png`** — uploading the raw file errors with
  *"File envelope invalid (source): Invalid input: expected
  'lumintrack-labor-extension'"*. CLAUDE.md claims the tolerant adapter accepts
  raw captures, so VERIFY current behavior: is the raw `requisitionViewList`
  shape accepted, or is the envelope check too strict (regression/gap)?
- [ ] **`one row error in preview.png`** — preview shows 305 NEW / **1 ERRORED**:
  row #71 (req `158969`, "Zscaler Engineer") skipped for *"customerName is
  required"*. CONFIRMED in the data: that row's `customerName` is `""`. This is
  CORRECT skip behavior — verify the other 305 import cleanly and the skip
  reason reads clearly. (Not a bug; documented as expected.)
- [ ] Full happy-path: preview → confirm import (305) → spot-check imported jobs,
  iLabor signal fields (submitLimit / submitStatus), and the `/jobs/imports` history row.

## Notes for the next session (post /clear)
- Branch `round5-submission-workflow-overhaul`; fix `dc0fe1d` merged to `main`.
- Preview MCP unreliable here — drive the **Claude in Chrome** extension + `npm run dev`.
- Test data already mutated: SUB-312 → Joined (PLC-002), SUB-191 → Vendor Screening Call,
  Priscilla Nguyen → PLACED. Not reverted (owner said leave it).
- iLabor import is **admin-only** — log in as admin to test the uploads scenarios.
