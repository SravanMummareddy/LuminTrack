# LuminTrack — future enhancements

> **🅿️ Parked 2026-05-26 — revisit after 2-4 weeks of real use.**
>
> The medium-bug sweep landed and the app is feature-complete for the
> recruiting workflow it was built for. None of the items below are
> needed *today* for a <10-person internal tool: §J1 only matters once
> EU/CA-resident data lands, §J3 only matters with external admins,
> §E1 only pays off when candidate volume actually hurts, the iLabor
> extension is pure convenience over the working copy-paste flow, and
> §J4 is theatre at this team size. **Deliberate pause, not an
> oversight** — ship what's built, watch real recruiter friction for a
> few weeks, then let usage decide the next build. Reopen this file
> when a specific user pain (or a client/legal ask) points at one of
> the items below.

Larger work items split out of `bugs.md` after the medium-bug sweep and
the §F2 funnel-velocity ship on 2026-05-26. None of these are demo
blockers; each is at least a multi-session build with its own design
spike. Priority order reflects ROI / risk / dependency — work down the
list, not across.

Status: nothing here is in progress. Pick one before starting and move
its "Status" line below to **IN PROGRESS**.

---

## 1. §J1 — PII export + right-to-be-forgotten · **L**

**Status:** queued.

**What it does**

Two related admin workflows for a single candidate:

- **Export** — one-click download of everything LuminTrack knows about
  the candidate. Format: single JSON file (GDPR Article 15 / CCPA
  "structured, commonly used, machine-readable"). Scope:
  - The full `Candidate` row (name, email, phone, location, work auth,
    experience, current company, skills, featured skills, LinkedIn,
    notes, status, tags, lastContactedAt, source, isActive, timestamps).
  - Every `CandidateResume` (label + Drive link + `isActive` so archived
    résumés are still captured — file contents stay in Drive).
  - Every `Submission` for the candidate, with linked Job title + Client
    name + Vendor name resolved (status, rate, notes, rejection reason,
    duplicate-override reason, submittedAt, expected/actual join dates).
  - Every `InterviewRound` under those submissions (round name, type,
    mode/platform, meeting link, scheduledAt, scheduledTimezone,
    interviewer, result, feedback, notes).
  - Every `Note` row touching the candidate or their submissions /
    interview rounds.
  - The full `Activity` audit trail tied to the candidate (action,
    description, eventAt, note, reason, acting user's name, createdAt).
- **Soft-delete with redaction** — `fullName → "Removed candidate"`,
  email / phone / LinkedIn / notes / company / location / résumé Drive
  links nulled. `submissions` rows and audit history preserved so
  historical reports stay intact. No hard delete.

**Pros**

- Legal requirement before any EU / CA-resident-data client onboards.
- Cheap insurance — rarely invoked, important when needed.
- Doing nothing today means an admin runs ad-hoc Postgres `UPDATE`s
  by hand. That's both error-prone *and* unauditable.

**Cons**

- Zero daily-workflow win.
- Per-table redaction decisions need a written policy. Easy to leave
  half-deleted PII that creates *more* risk than not doing the workflow.
- Optional: ZIP-up-the-Drive-files version is a real spike — needs
  Drive API OAuth, which LuminTrack doesn't have yet.

**Sizing:** ~1 day for the JSON-export + soft-delete action + admin
UI; +0.5 day if the deliverable also bundles the Drive files.

---

## 2. iLabor Phase 8b — browser extension · **M** + Chrome Web Store

**Status:** queued. Separate repo (not part of this codebase).

**What it does**

Manifest V3 browser extension (Chrome/Edge) that sits on the Randstad
iLabor portal, intercepts the requisition-list XHR response, and POSTs
the raw JSON to LuminTrack's `/api/import-ilabor` endpoint. Today admins
copy the network response by hand and paste it into the `/jobs/import`
wizard — this extension removes that step.

**Pros**

- Already unblocked: the tolerant envelope adapter shipped in Phase 4
  polish accepts raw network captures, so the extension is **purely a
  UX upgrade**, not a backend gate.
- Removes the only awkward step in a weekly admin workflow.

**Cons**

- Separate repo + Chrome Web Store approval cycle (3-7 days, sometimes
  longer for first-time publishers).
- MV3 CORS/CSP rules need a matching `externally_connectable` config
  on the LuminTrack side.
- Real attack-surface increase — the extension reads iLabor session
  cookies. Needs a code-signing story and a clear "uninstall and
  rotate" runbook.

**Sizing:** ~2 days for the extension; +Chrome Web Store review.

---

## 3. §J3 — admin 2FA (TOTP) · **L**

**Status:** queued.

**What it does**

Optional Google-Authenticator-style TOTP for users with `role = ADMIN`.
After password check, prompt for the 6-digit code. Stores the secret
encrypted at rest, issues one-time recovery codes at enrolment, and
includes an admin reset path for "I lost my phone."

**Pros**

- Admins can delete data, see all PII, run audits — they're the
  highest-value target.
- Standard libraries (`otplib`, `speakeasy`) give you the crypto. ~150
  lines including QR enrolment + recovery codes.
- Non-admin flow stays untouched.

**Cons**

- Needs an enrolment flow, a recovery-code flow, and a "lost device"
  reset path or you'll lock yourself out.
- Encrypted-at-rest secrets ideally want a KMS; at minimum a separate
  env var so the encryption key isn't reused from `AUTH_SECRET`.
- Optional 2FA gets ~30% admin adoption in practice. Mandatory works,
  but is a hard sell internally.

**Sizing:** ~0.5 day for enrolment + verify + recovery codes; +0.5 day
for the "lost device" admin reset path.

---

## 4. §E1 — résumé parsing · **XL**

**Status:** queued. Needs a design spike before estimating committed
delivery.

**What it does**

Paste a Drive link or upload a PDF → auto-extract name / email / phone
/ current company / experience / skills into the candidate form, with
a confirmation step ("we found 4 fields — confirm?") before save.

Two implementation routes:

- **Vendor:** Affinda (~$0.05/résumé), Sovren, RChilli. Mature,
  accurate, ongoing cost.
- **LLM:** Claude/GPT structured output. Cheaper per parse at low
  volume, more brittle on weird formats, needs a guardrail layer.

**Pros**

- Single biggest data-entry win in any ATS. Vendors cite 60-80%
  reduction in time-to-first-submission.
- Even imperfect parsing (70% correct fields) is a net win — the form
  still lets you edit before save.

**Cons**

- External dependency — Affinda outage degrades the candidate-add
  flow.
- Ongoing cost ($80/mo at 30 candidates/week for Affinda; LLM cheaper
  but per-token).
- LuminTrack résumés are Drive *links*, not owned PDFs. Extraction
  needs either the deferred Blob upload from Phase 3 or Drive-API
  fetch with OAuth (significant plumbing either way).
- Confidence UI ("we found 4 fields — confirm?") is its own design
  problem.

**Sizing:** ~2 weeks: vendor pick + API integration + confidence UI +
Drive-fetch plumbing.

---

## 5. §J4 — session inspector · **M-L**

**Status:** queued. Lowest priority — reconsider only if team grows
past 10 users or after a real incident.

**What it does**

Persist sessions in a `Session` DB table on login (jti claim → row),
delete on logout. Admin page at `/admin/sessions` lists each user's
active sessions with IP, user agent, created/lastSeen timestamps, and
a Revoke button that deletes the row + denylists the JTI.

**Pros**

- Real audit value paired with §J3.
- Lets you force-logout a compromised admin immediately.
- Cheap once you've decided to do it.

**Cons**

- Current auth is **stateless JWT-only**. Adding a session table means
  every authenticated request hits the DB — measurable ~5ms/request
  latency Vercel→Neon.
- Mostly theatre for a <10-user team — you can just call them.
- May want refresh tokens at the same time, which doubles scope.

**Sizing:** ~0.5 day for the table + writes; ~0.5 day for the
inspector UI. Significantly more if refresh tokens get added in the
same pass.

---

## Granular IAM (per-candidate ACLs, finance/lead-recruiter roles) · **M**

**Status:** queued. Seam already in place (`src/lib/permissions.ts`).

**What it does**

Extends the binary ADMIN/RECRUITER policy. Three additive moves:

- New roles — `LEAD_RECRUITER`, `FINANCE`, `READ_ONLY`. Each gets a
  declarative capability list (manage sensitive docs, see rates, see
  audit, etc.).
- Per-candidate ACLs — an assigned recruiter can see their assigned
  candidate's sensitive documents (Identity, Work Auth) even without
  ADMIN. Lives on a new `CandidateGrant(userId, candidateId, scope)`
  table.
- Per-document override — a doc can be flagged `visibleToAll: true`
  to override its category's sensitivity, or `adminOnly: true` to
  raise it above the category default.

**Why now (low priority but plumbed):** Round 4.1 added the
`canViewSensitiveDocs` / `canManageSensitiveDocs` / `isSensitiveCategory`
helpers as the single point of policy. Extending them is now a
one-file change; without the seam, the extension would have touched
every server action and page.

**Sizing:** ~3-5 days. Largely a UI + migration task; the core helper
shape doesn't change.

---

## iLabor re-import — medium/low follow-ups (2026-05-28)

The high-priority silent-corruption guards shipped on `main` (see
CLAUDE.md commits `962e861..03fede5`). What remains from the
deep-dive sweep:

### Rate-unit assumption on `c2crate`

Today we treat the iLabor `c2crate` field as $/hr and use it for
margin math (`vendorRate × 8h × duration`). If iLabor ever sends
a per-day rate, a per-week rate, or a non-USD value, we'd silently
overwrite the rate and break the projections. No signal anywhere.

**Action:** confirm with the product owner against iLabor's UI
that `c2crate` is always $/hr USD. If confirmed, drop a one-line
comment in `src/lib/validation/ilabor-import.ts` noting the
assumption. If ever needs to vary, add a per-vendor unit
override column.

**Sizing:** 5 minutes to ask, 5 minutes to comment. Skip until a
non-USD vendor onboards.

### Title-cleanup noise on the drift warning

Spelling fixes ("Dev" → "Developer", "Sr." → "Senior") will trip
the title-drift warning every time, training operators to ignore
it. If product confirms this happens often, mitigate by:

- Edit-distance threshold — ignore drift when the Levenshtein
  distance is < 5 characters (or < 20% of length).
- Or: stop showing the badge but keep the audit-log diff (which
  is the post-hoc safety net anyway).

**Sizing:** ~2 hours including a `levenshtein` helper.

### `questionStatus` mid-flight change

A recruiter submits to a req under "no screener". The next day
iLabor attaches a screener (`questionStatus` flips from 0 to 3).
The existing submission has no answers, so iLabor will likely
reject it downstream — but LuminTrack gives the recruiter no
heads-up that the requirements changed.

**Action:** when a re-import flips `ilaborScreenerCode` from
0/null to a positive value for a job with active submissions,
emit a per-submission audit row (or surface a banner on the
submission detail) telling the recruiter to attach screener
answers.

**Sizing:** ~half a day.

### Race during re-import

A recruiter creating a submission at the exact moment an admin
re-imports — and the job's vendor/client gets re-linked in that
window — could observe a flicker (form shows old vendor name
while DB has new vendorId). Tx isolation makes this benign
(no data corruption), but visually confusing.

**Mitigation:** none needed at current team size. If/when
import frequency grows, gate `createSubmission` on the same
pg advisory lock the import action uses for the job in
question.

**Sizing:** ~2 hours.

---

## Round 4 follow-ups (deferred post-demo, 2026-05-28)

Surfaced during the R4 scenario sweep. The two surgical fixes that
shipped on `main` (placement reactivation on re-JOINED, candidate
status guard while ACTIVE placement exists) closed the data-integrity
gaps; the rest are polish + scale items with no urgent driver.

### R4.4 — Scheduled Drive backup (was always post-demo)

- Vercel Cron daily at 02:00 UTC.
- Google service account + Drive folder ID in env vars
  (`GOOGLE_SA_JSON`, `BACKUP_DRIVE_FOLDER_ID`).
- Calls `buildBackupJson()` and `buildBusinessExcelBuffer()` (the
  in-memory variant kept for non-HTTP callers; the streaming variant
  is HTTP-only).
- Retains last 30 days, deletes older snapshots.
- Logs `DATA_EXPORTED` with `note="daily-cron"`.

**Sizing:** ~3-5 days. Mostly googleapis wiring + cron config.

### Auto-close placements past `endDate`

Today a placement whose `endDate` has passed stays `ACTIVE` until
someone manually ends it. Reports surface "Ending in 14 days" but
nothing closes the loop.

- Nightly cron that flips `ACTIVE → ENDED` when
  `endDate < today AND no future extension covers today`.
- System endNote: `"auto-closed: end date passed"`.
- Logs `PLACEMENT_ENDED` with `note="auto-close"`.
- Runs the same `endOfPlacementCascade` (candidate flips to
  AVAILABLE when no other ACTIVE placements remain).

**Sizing:** ~half a day once R4.4 cron infrastructure exists.

### Warn when ending one placement with another still active

Minor UX: the End-placement form should tell the recruiter
"Candidate has another ACTIVE placement (PLC-XXX) — their engagement
status will remain PLACED." Today the cascade already handles it
correctly; this is just transparency.

**Sizing:** ~2 hours.

### Expired Work Auth policy (product decision)

Today an expired WORK_AUTH document shows a red "EXPIRED" pill on
the candidate page and the dashboard widget, but doesn't block new
submissions. HR / legal needs to decide:

- Hard block? (`createSubmission` refuses if the candidate has an
  expired WORK_AUTH doc.)
- Soft warn? (`needsConfirm: true` with a reason field, same
  pattern as the duplicate-submission override.)
- No automatic enforcement, just visible signal? (current state)

Not a code task until product weighs in. Capturing here so the
question isn't lost.

---

## Deferred indefinitely (not in any milestone)

These were explicitly declined on 2026-05-26:

- **§G1-G3** — in-app notifications, email digests, Slack/Teams
  webhooks. Workflow doesn't need push at current team size.
- **§I4** — dark mode / high-contrast. Not a current priority.

If team usage patterns change (asynchronous teams, mobile-heavy
recruiters, off-hours work), revisit §G1-G3 first.
