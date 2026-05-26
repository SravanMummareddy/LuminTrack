# LuminTrack — future enhancements

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
  - Every `CandidateResume` (label + Drive link — file contents stay in
    Drive).
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

## Deferred indefinitely (not in any milestone)

These were explicitly declined on 2026-05-26:

- **§G1-G3** — in-app notifications, email digests, Slack/Teams
  webhooks. Workflow doesn't need push at current team size.
- **§I4** — dark mode / high-contrast. Not a current priority.

If team usage patterns change (asynchronous teams, mobile-heavy
recruiters, off-hours work), revisit §G1-G3 first.
