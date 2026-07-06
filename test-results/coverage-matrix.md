# LuminTrack — Requirements Coverage Matrix (Demo-Readiness Audit)

**Date:** 2026-07-06  ·  **Branch:** `feature/feedback-round-1`  ·  **Method:** static code read (schema, routes, actions, queries, components). No source modified.

**Sources of truth:** (1) `docs/PROJECT_REQUIREMENTS.md` (MVP spec — §9 pages, §19 acceptance criteria, §7/8/10/11/12/13). (2) June-19 Excel `Dashboard - requirements- user-june-19th.xlsx` (bench-sales pivot, 6 tabs).

**Status legend:** Present & Working · Present but Suspect · Partial · MISSING

---

## A. Dashboard (§9.1, §19-12)

| Requirement | Source | Feature/Page in app | Evidence (file) | Status | Notes |
|---|---|---|---|---|---|
| Total active jobs | §9.1 | Dashboard KPI | `queries/dashboard.ts:47`, `(dashboard)/page.tsx:354` | Present & Working | Active = OPEN/ON_HOLD with ≥1 assigned recruiter |
| Jobs by status | §9.1 | — | dashboard.ts (only OPEN/ON_HOLD counted) | Partial | No full by-status breakdown card on dashboard; only active/on-hold split in a hint |
| Jobs by sister company source | §9.1 | — | not computed in dashboard.ts | MISSING | Filter exists but no metric/card. Available in nothing on-dashboard |
| Total submissions | §9.1 | Dashboard KPI | dashboard.ts:88, page.tsx:362 | Present & Working | |
| Submissions by stage | §9.1 | Bar chart | dashboard.ts:52-55, page.tsx:412 | Present & Working | All SUBMISSION_STATUSES grouped |
| Interviews count | §9.1 | Dashboard KPI | dashboard.ts:59-62, page.tsx:369 | Present & Working | |
| Selected / Offer released / Joined / Rejected / On-hold counts | §9.1 | Dashboard KPIs | dashboard.ts:91-95, page.tsx:376-409 | Present & Working | |
| Recruiter-wise submissions/interviews/selected/joined | §9.1 | Recruiter table | dashboard.ts:64-82, page.tsx:416-472 | Present & Working | |
| Open vs closed jobs | §9.1 | — | dashboard.ts (open/on-hold only) | Partial | "Closed" side not surfaced on dashboard |
| Aging jobs | §9.1 | — | logic exists in analytics but not rendered on dashboard | MISSING | Not on dashboard (aging table absent from reports too — see §H) |
| Filters: date range (day/week/month/year/custom) | §9.1 | analytics-filters | `lib/filters.ts:3-12`, analytics-filters.tsx | Present & Working | |
| Filters: recruiter/client/vendor/source/job-status/submission-status | §9.1 | analytics-filters | analytics-filters.tsx:39-108 | Present & Working | |
| Scope toggle (me/org) | (extra) | Dashboard | page.tsx:66-112,186 | Present & Working | Beyond spec; useful |

---

## B. Jobs (§9.2, §9.3, §9.4)

| Requirement | Source | Feature/Page | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Job list with title/client/vendor/source/location/recruiters/status | §9.2 | `/jobs` JobsTable | `components/jobs/jobs-table.tsx:44-174` | Present & Working | |
| List: # submissions column | §9.2 | Subs column | jobs-table.tsx:151-162 (`_count.submissions`) | Present & Working | |
| List: # interviews / # selected / # joined columns | §9.2 | — | jobs-table.tsx (only Subs count) | MISSING | Spec asks for interviews/selected/joined per row; only Subs count present |
| Add/Edit job form: title/client/vendor/source/location/status/description/notes | §9.3 | job-form.tsx | job-form.tsx:109-484 | Present & Working | |
| Add/Edit job: vendor rate + candidate rate | §9.3 | job-form (More details) | job-form.tsx:279-308 | Present & Working | Present but demoted into collapsible "More details"; hints say "usually set on the requirement". Client rate is the primary rate (three-tier model) |
| Add/Edit job: assigned recruiter(s) multi-select | §9.3 | Checkbox multi-select | job-form.tsx:486-516 | Present & Working | |
| Validation: title/client/vendor/source required | §9.3 | required attrs + Zod | job-form.tsx:109,114,147,180 | Present & Working | |
| Validation: status required | §9.3 | defaults to OPEN | job-form.tsx:219 | Partial | Status not enforced-required; silently defaults to OPEN |
| Job detail: summary + submission summary + submitted-candidates table + timeline | §9.4 | `/jobs/[id]` | jobs/[id]/page.tsx (timeline present) | Present & Working | Timeline verified on detail page |
| Close job action | §9.2 | status change | jobs actions / edit | Present & Working | Via status edit; no hard delete (project norm) |

---

## C. Candidates (§9.5, §9.6, §9.7, §12)

| Requirement | Source | Feature/Page | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Candidate form: name/email/phone/location/visa/experience/company/skills/linkedin/notes | §9.6 | candidate-form.tsx | candidate-form.tsx:153-364 | Present & Working | |
| Validation: name required; ≥1 contact (email or phone) | §9.6 | required + Zod | candidate-form.tsx:153 | Present & Working (name); Partial (≥1-contact) | Verify Zod enforces "email OR phone" — schema in `validation/candidate` |
| Duplicate detection on email/phone with warn + override | §9.6, §12 | action-layer | `actions/candidates.ts:80-101,180` | Present & Working | "Save anyway" override; not a hard block |
| Candidate list: name/email/phone/location/visa/experience/skills/company/status/link | §9.5 | `/candidates` | candidates/page.tsx + table | Present & Working | Skills capped at 3 chips (list); column picker |
| Candidate detail: profile / submission history / interview history / activity timeline | §9.7 | `/candidates/[id]` | candidates/[id]/page.tsx:225-508 | Present & Working | Also placements + documents sections |
| Resume/profile link on candidate | §9.6, §11 | Resume library (post-save) | resume-section.tsx | Present & Working | See §L — now real file upload, not Drive link |

---

## D. Submissions (§9.8, §8, §19-3/4/5/8)

| Requirement | Source | Feature/Page | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Submit candidate to job (3 entry points) | §19-3 | job/candidate/global forms | actions/submissions.ts, submission-form.tsx | Present & Working | |
| Duplicate prevention: same candidate+job | §12, §19-4 | action-layer check | submission-create.ts:102-103; actions/submissions.ts:102-178 | Present & Working | DB `@@unique` dropped in favour of action check + `duplicateReason` override |
| Status pipeline (Submitted→…→Joined) | §8, §19-5 | Visual pipeline | `components/submissions/status-pipeline.tsx`; labels.ts:138-163 | Present & Working | 11 enum statuses incl OFFER_ACCEPTED, BACKED_OUT |
| Mark selected/rejected/on-hold/offer-released/joined | §19-8 | status form | submission-status-form.tsx; actions/submissions.ts:349-488 | Present & Working | Reason preset + note + event date; JOINED auto-creates placement |
| Submission detail: summary + pipeline + rounds + notes + timeline | §9.8 | `/submissions/[id]` | submissions/[id]/page.tsx | Present & Working | Timeline present |
| Submissions list + filters + column picker | §9.8, §10 | `/submissions` | submissions-table.tsx; submission-filters.tsx | Present & Working | Status/date/recruiter/client/vendor/source filters; "Mine stale >7d" |

---

## E. Interview Rounds (§7.8, §9.8, §19-6/7)

| Requirement | Source | Feature/Page | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Unlimited rounds per submission | §7.8, §19-6 | rounds manager | interview-rounds-manager.tsx; actions/interviews.ts:51-57 | Present & Working | No cap; roundOrder increments |
| Round fields: name/type/interviewer/date-time/result/feedback/notes | §7.8 | round form | interview-round-form.tsx:80-259 | Present & Working | |
| Round: meeting link, mode (in-person/phone/video), platform, timezone | (extra) | round form | interview-round-form.tsx:134-240 | Present & Working | Beyond spec |
| Add feedback / update result | §19-7 | round form | actions/interviews.ts:129-146 | Present & Working | |

---

## F. Interviews Roll-up Page (June-19 "Interviews" tab)

| Excel field | Source | On `/interviews` list | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Date of interview | Interviews tab | Date column | interviews-table.tsx:29,47 | Present & Working | |
| Candidate Name | Interviews tab | Candidate column | interviews-table.tsx:30,50 | Present & Working | |
| Technology | Interviews tab | Technology column | interviews-table.tsx:33,64 (featuredSkills[0]) | Present & Working | Derived from candidate skills |
| Time (separate from date) | Interviews tab | merged into Date | interviews-table.tsx:47-49 | Partial | Time shown within the datetime, not a separate column |
| Location | Interviews tab | — | not in table | MISSING | Not on list (job-level, not round-level) |
| Vendor | Interviews tab | — | not in table | MISSING | Client shown; Vendor not |
| Client | Interviews tab | Client column | interviews-table.tsx:31,58 | Present & Working | |
| Interview Type | Interviews tab | inline w/ Round | interviews-table.tsx:75 | Present & Working | |
| Sales Recruiter | Interviews tab | Sales recruiter column | interviews-table.tsx:32,61 | Present & Working | |
| Round | Interviews tab | Round column | interviews-table.tsx:34,67 | Present & Working | |
| Support (Y/N) | Interviews tab | Support column | interviews-table.tsx:35,81 (schema `supportNeeded`) | Present & Working | Captured in round form (checkbox) AND shown on list. |
| Remarks | Interviews tab | — | not in table | MISSING | Feedback/notes captured per round but no Remarks column on the roll-up list |

---

## G. Placements (June-19 "Placements" tab, R4.2)

| Excel field | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Auto-create on JOINED | R4.2 | lifecycle | placement-lifecycle.ts (JOINED→Placement) | Present & Working | Reactivates terminated on re-JOINED |
| Consultant / Role / Vendor / Client / Location | Placements tab | detail + list | placements.ts:105-117; placements/[id]/page.tsx | Present & Working | |
| Bill Rate / Pay Rate / Margin | Placements tab | detail | [id]/page.tsx:197-227 (admin-masked) | Present & Working | |
| Recruiter / Lead | Placements tab | detail | [id]/page.tsx:228-230; `teamLead` field | Present & Working | |
| Date of Interview / Date of Placement / Start Date / Remarks | Placements tab | detail (edit) | [id]/page.tsx:283-312 (interviewDate/placementDate/remarks) | Present & Working | Schema fields present + on edit form |
| Organisation | Placements tab | detail | [id]/page.tsx:283 (`organisation`) | Present & Working | |
| "Give Pop like Joined or Back out" (status pop) | Placements tab | JOINED cascade heads-up + BACKED_OUT status | status form; SubmissionStatus.BACKED_OUT | Partial | BACKED_OUT exists + JOINED cascade notice on status form; no literal celebratory "pop" toast on placement page |
| Placements filters (status/client/recruiter/date) | R4.2 | `/placements` | placements-filters.tsx:15-50 | Present & Working | Default ACTIVE |

---

## H. Reports / Analytics + Monthly Performance (§9.11, June-19 "Monthly Performance")

| Requirement | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Candidate pipeline by stage | §9.11 | Analytics tab | reports.ts:71-75 | Present & Working | |
| Submissions/interviews/selected/joined by recruiter | §9.11 | Analytics tab | reports.ts:57-69 | Present & Working | |
| Submission→interview conversion | §9.11 | Analytics | reports.ts:88-94 | Present & Working | |
| Interview→selection conversion | §9.11 | Analytics | reports.ts:95-97 | Present & Working | |
| Jobs by source / client / vendor | §9.11 | — | removed as "clutter" (reports.ts:28-34); filters remain | MISSING | Spec explicitly lists these three report breakdowns; not rendered anywhere |
| Open job aging report | §9.11 | — | aging logic exists, not rendered | MISSING | Recruiter-aging (stale subs >14d) present, but not *job* aging |
| Company/vendor/client-wise performance | §9.11 | — | partly via recruiter tables only | Partial | Only recruiter-dimension performance shown |
| Active placements + projected margin | (extra R4.2) | Analytics | reports.ts:134-187 | Present & Working | |
| Monthly scorecard: Submissions per recruiter/week | Monthly Perf tab | monthly-scorecard.ts:199 | scorecard-grid.tsx | Present & Working | On `submittedAt` |
| Monthly scorecard: Interviews per week | Monthly Perf tab | monthly-scorecard.ts:203 | " | Present & Working | On round `scheduledAt`; null-scheduled rounds skipped |
| Monthly scorecard: New vendors | Monthly Perf tab | monthly-scorecard.ts:214-223 | " | Present but Suspect | Company-wide "first-ever submission to a vendor" — a vendor claimed in a prior month never re-counts, which can read as 0 for a recruiter who did open a new vendor relationship that month. By-design but confusing; **gated owner question**. |
| Monthly scorecard: Closures | Monthly Perf tab | monthly-scorecard.ts:206-207 | " | Present but Suspect | = placements whose `startDate` falls in the month, credited to submission's recruiter. Not reconciled to actual "closed/placed" business event beyond placement start; verify definition matches owner's "Closures". **Flagged reconciliation risk.** |
| Monthly scorecard: Backouts | Monthly Perf tab | monthly-scorecard.ts:201 | " | Present but Suspect | Bucketed on `submittedAt` (same as Submissions), NOT on when the back-out happened — a back-out shows in the submission's original week, not the week it backed out. Likely wrong for a weekly performance view. |
| Scorecard team totals + grand total | Monthly Perf tab | scorecard-grid.tsx:129-149 | " | Present & Working | |

---

## I. Bench Roster (June-19 "Bench Details" tab)

| Excel field | Source | In bench form | Displayed | Evidence | Status |
|---|---|---|---|---|---|
| Consultant Name | Bench tab | yes (req) | roster+detail | bench-consultant-form.tsx:127 | Present & Working |
| Reference | Bench tab | yes (More details) | detail | form:224 | Present & Working |
| Technology | Bench tab | yes | roster | form:154 | Present & Working |
| Marketing Exp / Real-time Exp | Bench tab | yes | roster+detail | form:183-187 | Present & Working |
| M Visa / A Visa | Bench tab | yes | roster (Visa)+detail | form:177-181 | Present & Working |
| Company | Bench tab | yes (More details) | detail | form:227 | Present & Working |
| Project Type | Bench tab | yes (More details) | detail | form:230 | Present & Working |
| Least rate on C2C | Bench tab | yes | detail | form:169 | Present & Working |
| Current Location | Bench tab | yes | roster | form:166 | Present & Working |
| Relocation | Bench tab | yes (checkbox) | roster | form:247 | Present & Working |
| Call Type | Bench tab | yes (More details) | detail | form:233 | Present & Working |
| Pay Roll Type | Bench tab | yes (More details) | detail | form:236 | Present & Working |
| Marketing Start Date | Bench tab | yes (More details) | detail | form:239 | Present & Working |
| Marketing Email / Password / Marketing number / Personal Number | Bench tab | yes (admin-gated credentials) | detail (masked) | form:272-279 | Present & Working |
| Roster display subset (S.No/Name/Tech/Visa/Exp/Location/Relocation/Recruiter) | Bench tab | — | roster default cols | bench-roster-table.tsx:38-170 | Present & Working |
| Grouped by High / Second priority | Bench tab | — | grouped sections | bench/page.tsx:84-112 | Present & Working |

---

## J. Vendor Portal Requirements (June-19 "VPR" tab)

| Excel field | Source | In VPR form | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Candidate Name (optional at plan time) | VPR tab | yes (optional) | requirement-form.tsx:125-145 | Present & Working | |
| Job Title / Vendor / Client / Company | VPR tab | via job (read-only/derived) | form:117; job relation | Present & Working | Company derives from candidate.currentCompany per model |
| Pay Rate / Bill Rate | VPR tab | yes | form:219-242 | Present & Working | |
| Location | VPR tab | yes | form:169 | Present & Working | |
| C2C/W2 (engagement) | VPR tab | yes | form:184-203 | Present & Working | |
| Recruiter / Team lead | VPR tab | yes | form:147-166,275-287 | Present & Working | |
| Vendor Recruiter Name | VPR tab | yes | form:263-273 | Present & Working | |
| Email / Phone | VPR tab | — (candidate-level) | — | Partial | Not on VPR itself; on linked candidate |
| Submitted Resume (need to upload) | VPR tab | at submission convert | convert flow | Partial | Resume attached at the submission step, not on the VPR record |
| VPR 1:many → submissions + convert flow | (model) | yes | vendor-portal/[id]/page.tsx:166-201; [id]/convert | Present & Working | VPR stays OPEN, accumulates submissions |

---

## K. Search & Filtering (§10, §19-13)

| Requirement | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Global search: candidate/job/client/vendor/source/recruiter/skills/location | §10 | topbar search | queries/search.ts:10-114; components/search/global-search.tsx; api/search/route.ts | Present & Working | Also searches display IDs |
| Filters on major list pages | §10 | FilterBar | ui/filter-bar.tsx | Present & Working | Jobs/Candidates/Submissions/Placements/Interviews |
| Date range presets (day/week/month/year/custom) | §5, §10 | date-range-field / filter-bar | ui/date-range-field.tsx; lib/filters.ts | Present & Working | Custom range reveals inline From/To (client hydration caveat noted in CLAUDE.md) |

---

## L. Files / Resume (§11, §19-15)

| Requirement | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Resume upload (local file) | §11, §19-15 | real @vercel/blob upload | resume-form.tsx:69-77; blob-upload.ts:17-29; actions/resumes.ts:66; api/resumes/[id]/route.ts | Present & Working | Real private-Blob upload (gzip), authenticated serve route. **Requires `BLOB_READ_WRITE_TOKEN` — present in local `.env`, absent from `.env.example`.** |
| Paste a Google Drive link | §11 | — | replaced by file upload | MISSING (spec deviation) | Spec explicitly wanted Drive-link paste "for MVP"; the app pivoted to real file upload only. Legacy Drive-link resumes are read-served (404 if no blob) but no Drive-link *entry* path in the form. |
| Submission references résumé used | §7.7, §11 | résumé picker + snapshot | submission-form.tsx:451-528; `resumeBlobUrl` snapshot | Present & Working | |
| Candidate documents vault (extra) | R4.1 | documents manager | candidate-documents.ts; api/documents/[id] | Present & Working | Beyond spec; identity/work-auth gated |

---

## M. Audit / Timeline (§13, §19-14)

| Requirement | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Timeline on job / candidate / submission detail | §13, §19-14 | ActivityTimeline | jobs/[id], candidates/[id], submissions/[id] pages | Present & Working | Verified on all three |
| Actions auto-logged (created/updated/status/interview/note/resume/etc.) | §13 | logActivity in txn | server/activity.ts; ActivityAction enum (50+ values) | Present & Working | Write + audit in one `$transaction` |
| Org-wide audit log | (extra) | `/audit` admin page | audit/page.tsx | Present & Working | Filter by action/user, paginated |

---

## N. Settings / Admin (§14)

| Requirement | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Manage sister companies / clients / vendors / users | §14 | `/settings` tabs | settings/page.tsx:18-69 | Present & Working | Admin-gated writes |
| Data export (Excel business/full + JSON) | (extra R4.3) | `/settings/export` | settings/export/page.tsx; api/export/* | Present & Working | Beyond spec |
| iLabor import + history | (extra) | `/jobs/import`, `/jobs/imports` | actions/ilabor-import.ts | Present & Working | Beyond spec |

---

## O. Recruiters (§9.9, §9.10, §19-11)

| Requirement | Source | Feature | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Recruiter list: jobs assigned/submissions/interviews/selected/offer-released/joined/rejections/on-hold | §9.9, §19-11 | `/recruiters` | queries/recruiters.ts:26-50; recruiters/page.tsx | Present & Working | Admin excluded from list |
| Recruiter filters (day/week/month/year/custom + client/vendor/source) | §9.9 | analytics filters | recruiters/page.tsx:57-64 | Present & Working | |
| Recruiter detail: assigned jobs / submissions / interviews / selected / joined / recent activity / performance over time | §9.10 | `/recruiters/[id]` | recruiters/[id]/page.tsx:147-340 | Present & Working | 8 stat cards + trend chart + timeline |

---

## §19 Acceptance Criteria Roll-up

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Create job requirements | Present & Working | job-form + actions/jobs.ts |
| 2 | Create candidate profiles | Present & Working | candidate-form + actions/candidates.ts |
| 3 | Submit candidate to job | Present & Working | submission-create.ts (3 entry points) |
| 4 | Same candidate can't be submitted twice to same job | Present & Working | action-layer dup check + override reason |
| 5 | Submission has a status pipeline | Present & Working | status-pipeline.tsx |
| 6 | Unlimited interview rounds | Present & Working | interviews actions/manager |
| 7 | Add feedback/notes | Present & Working | round form + notes |
| 8 | Mark selected/rejected/on-hold/offer-released/joined | Present & Working | status form |
| 9 | Job detail shows all submitted candidates + statuses | Present & Working | jobs/[id] |
| 10 | Candidate detail shows all jobs submitted to | Present & Working | candidates/[id] |
| 11 | Recruiter page performance counts | Present & Working | recruiters.ts |
| 12 | Dashboard shows jobs/submissions/stages/interviews/selections/joins | Present & Working | dashboard.ts (jobs-by-source/aging missing — see §A) |
| 13 | Search + filters on major pages | Present & Working | search.ts + filter-bar |
| 14 | Timeline visible for jobs/candidates/submissions | Present & Working | all three detail pages |
| 15 | Resume upload or Drive link works | Partial | Real file upload works (needs Blob token); Drive-link **entry** path removed (spec deviation) |
| 16 | UI understandable for non-technical users | Present & Working | clean primitives, badges, pipeline; not formally UX-tested |

---

## MISSING / BROKEN Summary (demo-embarrassment risks)

**MISSING (spec requirement with no implementation):**
1. **Reports: Jobs by source / client / vendor** (§9.11) — three named report breakdowns removed as "clutter" (reports.ts:28-34); filters still present with nothing behind them.
2. **Reports/Dashboard: Open job aging report** (§9.11, §9.1) — job-aging logic exists but is never rendered. (Recruiter *submission* aging is present; that's different.)
3. **Dashboard: Jobs by sister company source** (§9.1) — not computed.
4. **Dashboard: Aging jobs** (§9.1) — not on dashboard.
5. **Jobs list: # interviews / # selected / # joined per-row columns** (§9.2) — only the Subs count exists.
6. **Interviews roll-up list: Vendor, Location, Remarks columns** (June-19 Interviews tab) — captured elsewhere but absent from the `/interviews` list.
7. **Files: Google Drive link entry path** (§11) — spec asked for Drive-link paste; app replaced it with file-only upload.

**PRESENT BUT SUSPECT (works but likely wrong/incomplete — verify before demo):**
1. **Monthly scorecard "Backouts"** bucketed on `submittedAt` (original submit week), not when the back-out happened — misleads a weekly performance grid.
2. **Monthly scorecard "New vendors"** company-wide first-ever semantics: a recruiter who opens a vendor already touched in a prior month shows 0 — confusing without the footnote. **Gated owner question.**
3. **Monthly scorecard "Closures"** = placements whose `startDate` is in the month — verify this matches the owner's business definition of "Closures"; reconciliation risk flagged in the brief.
4. **Resume upload requires `BLOB_READ_WRITE_TOKEN`** — set in local `.env` but NOT in `.env.example`; a fresh/Vercel-preview environment without the token will make every résumé upload fail at demo time.

**PARTIAL (some sub-fields only):**
1. Dashboard "Jobs by status" / "Open vs closed" — only OPEN/ON_HOLD surfaced.
2. Job form status field not enforced-required (defaults OPEN).
3. Candidate "≥1 contact (email or phone)" required — confirm Zod actually enforces it.
4. Interviews list "Time" merged into Date column (no separate Time).
5. Placements "Give Pop like Joined or Back out" — BACKED_OUT status + JOINED cascade notice exist, but no literal celebratory toast on the placement page.
6. VPR Email/Phone and Submitted-Resume live at candidate/submission level, not on the VPR record itself.
7. Reports company/vendor/client-wise performance — only recruiter-dimension shown.

---

## Counts by status

| Status | Count (approx, across matrix rows) |
|---|---|
| Present & Working | ~78 |
| Present but Suspect | 4 |
| Partial | ~12 |
| MISSING | 7 |

**Bottom line for demo readiness:** The core MVP (§19 criteria 1–14, 16) is solidly implemented and demo-safe. The three demo-embarrassment risks to address first are: (1) confirm the **Blob token** is set wherever the demo runs (résumé upload silently fails otherwise), (2) the **Monthly Performance scorecard** metrics (Backouts week attribution, New-vendors semantics, Closures definition) are the shakiest live surface and are gated on open owner questions — avoid or caveat them, and (3) the **Reports page** advertises filters (source/client/vendor, job aging) for breakdowns that were removed — either restore them or trim the filters so the page doesn't look broken.
