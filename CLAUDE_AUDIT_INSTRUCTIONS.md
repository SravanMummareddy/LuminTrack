# LuminTrack Full Application Audit Instructions

Perform a comprehensive, evidence-based audit of the entire LuminTrack
application.

This is an audit and diagnosis pass only. Do not edit files, create
migrations, or implement fixes unless the user later explicitly approves
specific findings.

## Skills And Delegation

Use any relevant available skills before beginning and throughout the audit.
In particular, use skills appropriate for:

- Codebase investigation
- Systematic debugging
- Multi-agent or parallel review delegation
- Frontend/UI/UX auditing
- Accessibility review
- Browser verification using Playwright MCP
- Next.js work, if a relevant skill exists
- Verification before making completion claims

If subagents or parallel agents are available, dispatch multiple independent
reviewers with clearly separated scopes. Have them return evidence-backed
findings, then consolidate and deduplicate the results. If agents are
unavailable, perform the same perspectives as separate structured passes.

## Mandatory Repository Setup

Before reviewing behavior:

1. Read all repository instructions and product references that establish
   intended behavior, including:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `docs/PROJECT_REQUIREMENTS.md`
   - `bugs.md`
   - `ENHANCEMENTS.md`
   - `ILABOR_IMPORT_HANDOFF.md`
   - relevant files in `docs/`
2. Check `git status` first. There may be active uncommitted work. Do not
   alter, overwrite, revert, or judge unfinished changes as regressions
   without identifying that they are currently modified.
3. This repository uses Next.js `16.2.6`. The repo explicitly warns that its
   Next.js APIs and conventions may differ from prior knowledge. Before
   asserting that Next.js code is wrong, deprecated, or should be changed,
   read the relevant documentation in `node_modules/next/dist/docs/`.
4. Inspect available commands and dependencies from `package.json`.
5. Use Playwright MCP for rendered UI and workflow verification if available.
   If it is unavailable, explicitly state that rendered workflow verification
   is blocked and limit UI findings to source-level observations and any
   provided screenshots.

## Review Perspectives

Run each of these independent review perspectives.

### 1. Senior Full-Stack Engineer

Inspect architecture, Server Components, Client Components, Server Actions,
queries, routing, form state, validation, state refresh/revalidation,
loading/error flows, import handling, and business logic.

### 2. Database And Data-Integrity Engineer

Inspect Prisma schema, migrations, imports, enum changes, transaction use,
audit logging, uniqueness, relationship integrity, reporting correctness,
duplicate prevention, timezone/date behavior, and concurrency risks.

Confirm whether mutating operations follow repository rules, especially atomic
writes plus `logActivity()` where required.

### 3. Security And Authorization Reviewer

Inspect auth, session handling, access control, Server Actions, query
boundaries, input validation, file/resume access, imports, unsafe URLs, data
leakage, secret exposure, injection risks, and authorization bypasses.

### 4. QA / Regression Test Engineer

Identify functional failures, edge cases, missing validation, stale UI, broken
navigation, unexpected refresh behavior, empty-state problems, invalid
transitions, pagination/filter/sort inconsistencies, and failures after
browser reload or back/forward navigation.

### 5. UI/UX Product Designer

Review information hierarchy, layout, spacing, typography, table density,
responsiveness, forms, dialogs, navigation, action clarity, status visibility,
filtering, pagination, consistency, user feedback, error recovery, mobile
usability, and perceived complexity.

### 6. Accessibility Specialist

Review keyboard flows, tab order, focus visibility, dialog focus trapping and
restoration, labels, inline errors, semantics, screen-reader clarity, contrast
risks, target sizes, responsive accessibility, table usability, and
reduced-motion behavior where relevant.

### 7. Recruiting Operations User

Approach the product as a staffing user managing candidates, jobs,
submissions, interviews, contacts, resumes, notes, imports, analytics, and
audit history. Identify workflow friction, missing confirmations, ambiguous
statuses, lost context, inaccurate reporting implications, and operational
risks.

### 8. Adversarial / Failure-Mode Reviewer

Try to break workflows using unexpected sequencing: duplicates, blank fields,
rapid repeat submits, stale tabs, concurrent edits, invalid IDs, cancelled
dialogs, missing linked records, imported incomplete data, invalid dates,
overly long values, and inconsistent statuses.

## Source Audit Scope

Inspect at minimum:

- `src/app/**`
- `src/components/**`
- `src/lib/**`
- `src/server/**`
- `src/proxy.ts`
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/seed*.ts`
- Project configuration relevant to runtime, linting, builds, styling, auth,
  and database access

Do not limit inspection to visible UI. Include backend logic, persistence,
business rules, migration correctness, and cross-feature consistency.

## Workflow Audit Method

Do not only inspect individual screens. Build and execute a workflow matrix
covering the end-to-end journeys in the next section.

For every workflow:

1. State the user goal, starting route, and prerequisites.
2. Execute each meaningful step in the browser where feasible.
3. At each step, record how the UI reacts.
4. Check whether the reaction is clear, correct, timely, accessible, and
   consistent with the business workflow.
5. Check persistence after refresh and navigation away/back where relevant.
6. Check desktop and mobile behavior for user-facing workflows.
7. Record console/runtime errors, visible broken states, missing feedback,
   misleading status, lost context, or layout failures.
8. Take screenshots for confirmed visual or workflow defects when possible.

At each meaningful step, specifically observe:

- Is the available action obvious?
- Is the current status/state understandable?
- Does clicking or submitting produce clear immediate feedback?
- Are validation errors placed and worded correctly?
- Are loading, saving, success, failure, cancellation, and empty states
  handled?
- Does updated data appear in all correct places afterward?
- Is there an activity/history indication where the product expects one?
- Can the user recover from errors or cancel safely?
- Does the step remain usable on a narrow/mobile viewport?
- Is keyboard-only operation viable?

## Workflows To Cover

### Authentication And Session

- Log in with valid credentials.
- Attempt invalid login.
- Navigate while authenticated.
- Log out, if supported.
- Attempt access to authenticated routes without a valid session.
- Check refresh and back-button behavior around authentication boundaries.

### Dashboard And Navigation

- Load the dashboard and assess its initial information value.
- Navigate through sidebar, top navigation, and mobile navigation.
- Use recently viewed behavior if present.
- Validate empty, loaded, and long-content states.
- Check whether current location and next actions are clear.

### Global Search

- Search by candidate identifier/name and job identifier/title where supported.
- Search with partial text, no-result inputs, special characters, and cleared
  input.
- Open results and return to prior context.
- Evaluate response, result clarity, keyboard accessibility, and mobile
  usability.

### Candidate Management

- View the candidate list.
- Search, filter, sort, paginate, and change columns where supported.
- Create a candidate.
- Attempt invalid, duplicate, and incomplete candidate creation.
- Open candidate detail.
- Edit fields, status, tags, source, contact data, resume, notes, and related
  information where supported.
- Verify changes persist and appear consistently in lists, details, analytics,
  and history/activity where applicable.
- Evaluate whether a recruiter can quickly understand availability, history,
  skills, submissions, and next actions.

### Job / Requisition Management

- View job lists and source tabs.
- Search, filter, sort, paginate, and change columns where supported.
- Create or edit a job.
- Exercise work mode, priority, status, client/vendor/contact, dates, rates,
  openings, and imported/native job distinctions where supported.
- Attempt invalid values and status changes.
- Validate detail-page clarity and follow-on actions.
- Check whether retiring or closing a job behaves consistently with linked
  submissions and reports.

### iLabor Import

- Inspect the supported import workflow and supplied sample inputs.
- Test successful import if safe in the available environment.
- Test malformed, incomplete, repeated, and duplicate imports if feasible
  without corrupting useful data.
- Check progress, success/failure feedback, duplicate handling,
  imported-versus-existing clarity, preservation of relationships, and
  post-import navigation/review.
- Validate that users understand what imported, what did not, and what needs
  action.

### Submission Pipeline

- Create a submission linking a candidate to a job.
- Validate invalid or duplicate candidate/job combinations where relevant.
- Edit submission information.
- Move through available statuses/stages.
- Assess status pipeline clarity and whether historical state changes remain
  accurate.
- Verify linked candidate/job pages and dashboards reflect updates.
- Inspect rejection, withdrawal, placement, offer acceptance, and
  joining-related behavior where supported.

### Interviews

- Add interview rounds to a submission or candidate as applicable.
- Edit, reschedule, complete, cancel, or record results where supported.
- Test date/time/timezone display and invalid date handling.
- Verify meeting links, notes, outcome/result visibility, duplicate handling,
  and workflow history.
- Review the grouped candidate interview-history UI carefully on desktop and
  mobile.
- Check whether upcoming versus past interviews and required recruiter actions
  are obvious.

### Contacts And Settings

- Review users, clients, vendors, and contact-organization flows where
  available.
- Add, edit, or deactivate records where safe.
- Test filtering and search.
- Verify inactive linked data is handled without broken workflows or
  misleading selection options.
- Evaluate whether settings UI prevents operational mistakes.

### Resumes, Notes, And Activity History

- Upload, view, or update resumes if supported and safe.
- Add, edit, and view notes as permitted.
- Confirm timestamps, authors, ordering, empty states, and access behavior.
- Verify activity/audit records represent important mutations correctly and
  are understandable to operations users.

### Analytics And Reporting

- Open all analytics/reporting views.
- Apply filters, date ranges, and other controls.
- Cross-check reported numbers against visible source records for at least one
  small controlled scenario.
- Check zero-data, sparse-data, long-label, and mobile states.
- Look for timezone, status, join-date, stage-duration, and source attribution
  inaccuracies.
- Evaluate whether charts communicate accurately rather than merely appearing
  polished.

### Responsive And Cross-Cutting UI

Across major routes, inspect at:

- Desktop viewport around `1280px`
- Mobile viewport around `360px`
- A tablet-like width where it exposes intermediate layout behavior

Check horizontal overflow, clipped or overlapping controls, hidden critical
actions, table usability, dialog/form fit, sticky/header/sidebar behavior,
filters and pagination, typography wrapping, touch-target sizing, keyboard
navigation, feedback states, and browser console errors.

## Verification Commands

Run non-destructive verification appropriate to this repository, including at
minimum where feasible:

```bash
npm run lint
npm run build
```

Run additional safe checks only if supported by the repository. Do not invent
a test suite that is not configured.

When a command fails:

- Capture the actual failure.
- Identify whether it is caused by current uncommitted work,
  environment/configuration, missing credentials/database/network access, or
  an application defect.
- Do not silently modify files to get a passing result.

## Evidence Standards

A reported issue must be supported by at least one of:

- Exact source evidence with file path and line number
- Reproducible browser steps
- Screenshot evidence
- Console/runtime error
- Build/lint output
- Contradiction with documented requirements or repository rules
- Data-integrity reasoning tied to concrete schema/action/query code

Distinguish clearly between:

- Confirmed functional bugs
- Confirmed UI/UX or accessibility defects
- Security/data-integrity risks supported by code evidence
- Suspected issues requiring more environment access or seeded data
- Enhancements or preferences that are not bugs

Do not report generic subjective advice such as "make the UI more modern"
unless connected to an observable user problem.

## Required Output

Produce one consolidated audit report in Markdown. Do not implement fixes.

### Audit Coverage

Include:

- Instructions and documents read
- Skills used
- Reviewers/perspectives executed
- Routes and workflows inspected
- Viewports tested
- Commands executed and results
- Whether Playwright MCP was available
- Limitations, blocked checks, unavailable credentials, or environment
  constraints
- Whether existing uncommitted changes were detected

### Workflow Matrix

Provide a table with these columns:

| Workflow | Steps exercised | UI reaction checked | Desktop/mobile checked | Persistence/history checked | Result | Related findings |
| --- | --- | --- | --- | --- | --- | --- |

### Findings

List findings ordered by:

1. Critical
2. High
3. Medium
4. Low
5. UI/UX and Accessibility Improvements
6. Test Coverage Gaps

For each finding include:

- ID and concise title
- Severity
- Category
- Perspective(s)
- Confidence: Confirmed or Needs Verification
- Affected workflow
- Files and exact lines, where applicable
- Route and viewport, where applicable
- Preconditions
- Reproduction steps
- Expected behavior
- Actual behavior
- UI reaction at each failing step, for workflow issues
- User/business impact
- Technical impact
- Evidence
- Recommended fix direction, without implementing it
- Recommended regression test or Playwright scenario

### Cross-Workflow Consistency Review

Explicitly identify inconsistencies where a value or action differs among:

- List versus detail screens
- Candidate versus job versus submission views
- Activity history versus current state
- Analytics versus operational records
- Desktop versus mobile
- Imported versus manually created records

### Prioritized Fix Roadmap

Group confirmed findings into:

- Fix immediately
- Fix next
- Design/product decision needed
- Verify further before changing code

For each item, briefly explain dependency/order concerns and which workflows
must be regression-tested after a fix.

Remain in audit/report mode. Do not implement fixes until the user approves
them.
