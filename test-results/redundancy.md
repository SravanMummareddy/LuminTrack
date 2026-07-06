# LuminTrack — Redundancy / Duplicate-Work Audit

**Scope:** the three-tier pipeline Job → VendorRequirement (VPR) → Submission.
**Central question:** are we making users re-enter data the system already has, or repeat steps?

Method: read every create/edit form, its server action, the convert page, the pre-fill queries,
and the nav. Ranked by friction (most painful first). "Good carry-forward" items (pre-fill that is
editable) are called out separately as NOT redundant.

---

## REAL REDUNDANCIES (ranked by friction)

### 1. VPR's Client rate is re-typed even though the Job already holds it — no carry-forward. HIGH
- **What:** On the VPR form the team lead re-types **Client rate** (and Bill/Pay/Candidate rate), but the Job already captured **Client rate** (`job-form.tsx:228-242`, always shown) and Vendor rate + Candidate rate (`job-form.tsx:279-308`, in "More details").
- **Where:**
  - Job captures clientRate: `src/components/jobs/job-form.tsx:228-242`.
  - VPR re-asks clientRate/billRate/payRate/candidateRate: `src/components/vendor-portal/requirement-form.tsx:206-259`.
  - The VPR "new" page loads the job but passes **only `location`** as a default: `src/app/(dashboard)/vendor-portal/new/page.tsx:88-137` (`defaults={{ location: job.location ?? "" }}`). The job's `clientRate` is never selected or passed.
  - The requirement query CAN read `job` fields (`src/server/queries/requirements.ts:31-44`) but does not surface the job's rate to prefill the VPR.
- **Why redundant:** the Job already stores the client rate (and often a vendor/candidate rate). The team lead re-keys the same client-rate number on the VPR by hand.
- **Fix:** in `vendor-portal/new/page.tsx`, select `job.clientRate` and pass it into `defaults.clientRate` (editable prefill, same pattern as `location`).

### 2. Every rate + engagement + vendor-recruiter + team-lead + job-duties field appears on the VPR AND again on the Submission. MEDIUM-HIGH (mitigated in the convert path only)
- **What:** The Submission form re-collects Pay/Bill/Client rate, Engagement, Vendor recruiter name, Team lead, and Job duties (`submission-form.tsx:530-579`) — the identical set the VPR already collected (`requirement-form.tsx:206-298`).
- **Where:**
  - VPR fields: `requirement-form.tsx:169-313`.
  - Submission fields: `submission-form.tsx:530-579`.
- **Why partially redundant:** When you reach the Submission form via the **convert page**, all of these ARE prefilled from the VPR (`vendor-portal/[id]/convert/page.tsx:71-81` builds the `prefill` object; `submission-form.tsx:123-141` spreads `prefill`). **That is good carry-forward, not redundant** — see the "good" section.
  - The redundancy is real only for the **direct** submission entry points (`/submissions/new`, job-page, candidate-page), where the same VPR-style commercial fields are blank and must be re-entered even though a VPR for that job may already hold them. Those entry points do not look up an existing VPR.
- **Fix:** either (a) steer users through the VPR→convert path (which already prefills), or (b) when a direct submission's chosen job has an OPEN VPR, offer to prefill rates/engagement/duties from it.

### 3. Two separate UI paths create a submission — "convert from VPR" and "new submission" — with duplicated field sets. MEDIUM
- **What:** A submission can be created from (a) the VPR convert page, and (b) three "new submission" entry points (`/submissions/new`, job detail, candidate detail), all sharing `SubmissionForm` but wired to **different actions** (`convertRequirementToSubmission` vs `createSubmission`). The convert path prefills from the VPR; the direct paths do not.
- **Where:**
  - Convert: `vendor-portal/[id]/convert/page.tsx:62-83` → `convertRequirementToSubmission` (`actions/requirements.ts:247`).
  - Direct: `submissions/new/page.tsx:80-90` → `createSubmission` (`actions/submissions.ts:45`).
  - Both feed the same `SubmissionForm` (`submission-form.tsx:82`).
- **Why redundant:** two doors to the same outcome. A recruiter who starts at "/submissions/new" for a job that has a VPR re-enters everything the VPR already holds; a recruiter who goes via the VPR gets it prefilled. Same destination, inconsistent effort.
- **Fix:** this is defensible (three-entry-points was an explicit Round-5 decision), but the direct paths should detect an OPEN VPR for the chosen job and offer its data — otherwise the VPR tier is bypassed and re-keyed.

### 4. "Location" lives on Job, VPR, and Submission — captured up to three times. LOW-MEDIUM
- **What:** Location is on the Job (`job-form.tsx:245-252`), re-entered on the VPR (`requirement-form.tsx:170-183`), and the Submission has no location field but inherits none forward either.
- **Where:** Job `location` → VPR `location` (VPR does prefill it: `vendor-portal/new/page.tsx:135` + hint showing job location at `requirement-form.tsx:174,181`).
- **Why mostly OK:** the VPR **does** prefill location from the job and shows the job location as a hint — **good carry-forward**. The only mild redundancy is conceptual: three tiers can each hold a location string with no single source of truth.
- **Fix:** none required; the prefill already handles it. Consider showing "inherited from job" read-only unless overridden.

### 5. Candidate rate re-confirmation friction on the Submission form. LOW
- **What:** The Submission prefills `candidateRate` from the job's target rate but forces the recruiter to re-confirm/adjust via an amber "unconfirmed" nag (`submission-form.tsx:148-150, 442-447`).
- **Why:** this is intentional (prevents shipping the job's target rate as the negotiated rate) — a deliberate re-touch, not blind duplication. Borderline; keep but noted.
- **Fix:** none; acceptable guardrail.

### 6. Recruiter re-selected at each tier. LOW
- **What:** VPR captures a `recruiterId` (`requirement-form.tsx:147-166`); Submission captures `submittedById` (`submission-form.tsx:399-422`).
- **Why mostly OK:** the convert path prefills the submitter from the VPR's recruiter (`convert/page.tsx:68` `defaultRecruiterId={requirement.recruiterId ?? user.id}`) — **good carry-forward**. Redundant only on the direct paths, where it defaults to the current user anyway.
- **Fix:** none required.

---

## GOOD CARRY-FORWARD (NOT redundant — pre-fills but stays editable)

These are the RIGHT pattern and should be preserved:

- **VPR → Submission via convert prefills the full commercial block** (engagement, vendorRecruiterName, jobDuties, payRate, billRate, clientRate, teamLead, candidateRate, submissionNotes, and the candidate itself): `convert/page.tsx:71-81`, consumed at `submission-form.tsx:123-141`. Every field is editable. Excellent.
- **Job → VPR prefills location** and shows the job location as a placeholder/hint: `vendor-portal/new/page.tsx:135`, `requirement-form.tsx:174-182`.
- **VPR → Submission carries the recruiter and submission notes forward** (`convert/page.tsx:68,80`).
- **Team lead auto-derives** from the recruiter's team lead when left blank (`actions/requirements.ts:70,136` `deriveTeamLead`) — removes a lookup step. Good.
- **Self-claim on submit** — a recruiter isn't forced to a separate "assign me to this job" screen; claiming is inlined into the submit (`submission-create.ts:132-157`, `submission-form.tsx:597-606`). Removes a round-trip.
- **VPR stays OPEN after convert (1:many)** so submitting a second candidate doesn't require rebuilding the requirement (`actions/requirements.ts:426-431`). Good.
- **Job / VPR use the same job as a read-only pinned header** rather than re-picking it (`requirement-form.tsx:117-123`, `submission-form.tsx:325-330` job-locked). No re-selection. Good.

---

## NAVIGATION COST: "I have a job" → "candidate submitted"

Happy path through all three tiers:
1. Job detail → click **Create requirement** (`jobs/[id]/page.tsx:498`, links to `/vendor-portal/new?jobId=`).
2. VPR form → **Create requirement** → lands on VPR detail (`actions/requirements.ts:103`).
3. VPR detail → click **Submit a candidate** (`vendor-portal/[id]/page.tsx:116-123`, links to `/convert`).
4. Convert form → **Move to submission** → lands on submission detail.

That is **4 screens / 3 explicit hand-off clicks**, each a full navigation (no round-trips backward, which is good — every hop moves forward). The heaviest waste is not the hop count but that **tier 1 (Job) rate data does not seed tier 2 (VPR)** — see #1.

Shortcut that skips the VPR entirely: Job/candidate/global "New submission" → 1 screen. But taking that shortcut **loses every VPR prefill** and forces re-keying rates/engagement/duties (#2, #3).

---

## VERDICT

The three-tier flow is **mostly lean where it was deliberately wired, but leaky at the seams.** The
**VPR → Submission convert path is genuinely well done** — it prefills the entire commercial block,
the candidate, the recruiter, and notes, all editable; that tier does not make users repeat
themselves. The two real friction points are (1) **Job → VPR drops the ball on rates**: the Job
captures Client rate (and optionally vendor/candidate rate) but the VPR "new" page passes only
`location` as a default, so the team lead re-types the client rate the system already stored; and
(2) the **direct submission entry points bypass the VPR** and re-collect the same rate/engagement/
duties fields blank, so whether a recruiter repeats work depends entirely on which door they use.
Fixing #1 (seed VPR rates from the job) and #3 (have direct submissions detect and offer an existing
OPEN VPR's data) would close the loop and make all paths consistently prefill. Nothing forces a
backward round-trip, and no field is confirmed twice for its own sake — so it is not egregiously
redundant, but it stops short of "enter each fact once."
