# Internal Recruitment Tracking Dashboard — Project Requirements

## 1. Purpose

Build a simple internal web application/dashboard to track job requirements, recruiter submissions, candidate progress, interviews, outcomes, notes, and recruiter performance.

The current process uses Excel, Word, and scattered manual tracking. The goal is to replace that with one centralized internal dashboard.

This is **not** a public job board.
This is **not** a candidate portal.
This is **not** a client portal.
This is **not** an ATS with email automation or AI matching for now.

This is an internal tracking tool for a small recruiting team.

---

## 2. Business Context

The company receives job requirements from different sources.

Typical structure:

- Client = actual hiring company, example: Apple
- Vendor = staffing/vendor company, example: ABC Staffing
- Sister Company Source = the sister company that sent/shared the requirement
- Our Company = the team using this dashboard and submitting candidates

Example:

> Sister Company 1 sends us a Java Developer requirement from Vendor ABC Staffing for Client Apple.  
> Our recruiters search for candidates and submit them for that job.  
> We need to track who submitted which candidate, what happened after submission, interview rounds, feedback, rejection/selection, offer, and joining.

---

## 3. Main Goals

The app should answer these questions:

1. How many jobs do we have?
2. Which sister company sent each job?
3. Which client/vendor is each job connected to?
4. Which recruiters are assigned?
5. How many candidates were submitted for each job?
6. Which recruiter submitted each candidate?
7. What stage is each candidate in?
8. Did the candidate get an interview?
9. How many interview rounds happened?
10. What was the interview feedback?
11. Was the candidate selected, rejected, on hold, offered, or joined?
12. How many submissions/interviews/joins did each recruiter have?
13. Which companies/vendors/jobs are producing better results?
14. What is the full activity history for each job/candidate/submission?

---

## 4. Users

Initial expected users:

- Under 10 recruiters
- Possibly managers/admins later

For MVP:

- Everyone can see everything.
- Anyone can add/edit records.
- No complex role-based permissions needed initially.
- Keep audit/activity history so changes are traceable.

Future possible permissions:

- Admin/manager can create jobs
- Recruiters can submit candidates and update statuses
- Managers can view reports

Do not build complex permissions unless specifically requested later.

---

## 5. MVP Scope

### Must Have

- Dashboard overview
- Job requirements management
- Candidate management
- Candidate submission tracking
- Dynamic interview rounds
- Notes and feedback
- Activity timeline/history
- Recruiter performance basic counts
- Search and filters
- Resume upload or Google Drive link
- Date range filtering: day, week, month, year, custom

### Not Needed for MVP

- Email integration
- Notifications/reminders
- AI resume parsing
- AI candidate matching
- Candidate login
- Client login
- Public job board
- Commission/payroll tracking
- Mobile-first design

The app can be desktop-first for now.

---

## 6. Core Business Flow

The core flow is:

```text
Sister Company / Vendor sends Job Requirement
        ↓
Employee creates Job Requirement in system
        ↓
Recruiter(s) assigned
        ↓
Recruiter creates/selects Candidate
        ↓
Candidate submitted to Job
        ↓
Submission moves through process stages
        ↓
Interview rounds added if applicable
        ↓
Final result: Selected / Rejected / On Hold / Offer Released / Joined
        ↓
Dashboard and reports show progress/performance
```

---

## 7. Core Data Concepts

### 7.1 Sister Company Source

Represents where the job came from.

Fields:

- Name
- Contact person, optional
- Email/phone, optional
- Notes
- Active/inactive status

### 7.2 Client

The actual hiring company.

Fields:

- Client name
- Location, optional
- Notes
- Active/inactive status

### 7.3 Vendor

The vendor or staffing company connected to the requirement.

Fields:

- Vendor name
- Contact person, optional
- Email/phone, optional
- Notes
- Active/inactive status

### 7.4 Recruiter/User

Internal user of the app.

Fields:

- Full name
- Email
- Role, optional for now
- Active/inactive status

### 7.5 Job Requirement

Represents one open job requirement.

Fields:

- Job title
- Client
- Vendor
- Sister company source
- Location
- Vendor rate
- Candidate rate
- Assigned recruiter(s)
- Job status
- Job description
- Notes
- Created by
- Created date
- Updated date

Suggested job statuses:

- Open
- On Hold
- Closed
- Filled
- Cancelled

### 7.6 Candidate

Represents one candidate profile.

Fields:

- Full name
- Email
- Phone
- Current location
- Visa/work authorization
- Total experience
- Current company
- Skills
- LinkedIn URL
- Resume upload path or Google Drive link
- General notes
- Created date
- Updated date

### 7.7 Candidate Submission

Represents one candidate submitted to one job.

Important rule:

- Same candidate can be submitted to multiple different jobs.
- Same candidate should NOT be submitted more than once to the same job.
- Prevent duplicate candidate-job submission using candidate + job combination.

Fields:

- Candidate
- Job requirement
- Submitted by recruiter
- Submitted date
- Current submission status
- Candidate rate
- Resume used / resume link
- Submission notes
- Final outcome, if applicable
- Rejection reason, if applicable
- Created date
- Updated date

### 7.8 Interview Round

A submission can have unlimited interview rounds.

Do not hardcode only Round 1 and Round 2.

Fields:

- Submission
- Round name
- Interview type
- Interviewer name
- Interview date/time
- Result
- Feedback
- Notes
- Updated by
- Created date
- Updated date

Suggested interview types:

- Vendor Screening
- Client Interview
- Manager Round
- HR Round
- Final Round
- Other

Suggested round results:

- Waiting
- Need Another Round
- Selected
- Rejected
- On Hold
- Completed

### 7.9 Notes

Notes can be attached to:

- Job
- Candidate
- Submission
- Interview round

Fields:

- Related record type
- Related record ID
- Note text
- Created by
- Created date

### 7.10 Activity Timeline / Audit History

Track important actions automatically.

Examples:

- Job created
- Job updated
- Recruiter assigned
- Candidate created
- Candidate submitted
- Status changed
- Interview round added
- Interview feedback added
- Candidate rejected
- Candidate selected
- Offer released
- Candidate joined
- Note added
- Resume updated

Fields:

- Entity type
- Entity ID
- Action type
- Description
- Old value, optional
- New value, optional
- Performed by
- Created date

---

## 8. Submission Status Pipeline

Use this as the main candidate submission pipeline:

1. Submitted
2. Resume Picked
3. Vendor Screening Call
4. Client Interview
5. Selected
6. Rejected
7. On Hold
8. Offer Released
9. Joined

Important:

- "Client Interview" is a high-level status.
- Actual interview rounds are stored separately as dynamic records.
- A candidate can have 1, 2, 3, 4, or more interview rounds.
- Final outcomes should be clearly tracked.

Meaning:

- Selected = client liked/selected candidate after interview
- Offer Released = official offer sent
- Joined = candidate actually started the job
- Rejected = candidate did not move forward
- On Hold = waiting/no decision

---

## 9. Main Pages

## 9.1 Dashboard Page

Purpose:

Give management and recruiters a quick overview of the whole recruiting process.

Must show:

- Total active jobs
- Jobs by sister company source
- Jobs by status
- Total submissions
- Submissions by stage
- Interviews count
- Selected candidates count
- Offer released count
- Joined candidates count
- Rejected candidates count
- Recruiter-wise submissions
- Recruiter-wise interviews
- Recruiter-wise selected candidates
- Recruiter-wise joined candidates
- Open jobs vs closed jobs
- Aging jobs

Filters:

- Date range: day, week, month, year, custom
- Recruiter
- Sister company source
- Client
- Vendor
- Job status
- Submission status

Dashboard should be clean and easy for non-technical users.

---

## 9.2 Job Listings Page

Purpose:

Show all job requirements.

Each row/card should show:

- Job title
- Client
- Vendor
- Sister company source
- Location
- Assigned recruiter(s)
- Job status
- Number of candidate submissions
- Number of interviews
- Number selected
- Number joined
- Created date
- Last updated date

Actions:

- Add new job
- View job detail
- Edit job
- Close job
- Search/filter jobs

Filters:

- Job title
- Client
- Vendor
- Sister company source
- Recruiter
- Status
- Location
- Date range

---

## 9.3 Add/Edit Job Page

Purpose:

Create or update a job requirement manually.

Fields:

- Job title
- Client
- Vendor
- Sister company source
- Location
- Vendor rate
- Candidate rate
- Assigned recruiter(s)
- Job status
- Job description
- Notes

Validation:

- Job title required
- Client required
- Vendor required
- Sister company source required
- Status required

---

## 9.4 Job Detail Page

Purpose:

Show everything related to one job.

Sections:

### Job Summary

Show:

- Job title
- Client
- Vendor
- Sister company source
- Location
- Vendor rate
- Candidate rate
- Assigned recruiters
- Job status
- Job description
- Notes
- Created by/date
- Last updated date

### Submission Summary

Show:

- Total candidates submitted
- Candidates in each stage
- Interviews scheduled/completed
- Selected candidates
- Rejected candidates
- On hold candidates
- Offer released candidates
- Joined candidates

### Submitted Candidates Table

Columns:

- Candidate name
- Submitted by recruiter
- Submitted date
- Current status
- Latest interview/result
- Candidate rate
- Resume/profile link
- Last updated date

Actions:

- Add candidate submission
- View submission detail
- Update status
- Add interview round
- Add notes

### Job Activity Timeline

Show chronological activity:

- Job created
- Recruiter assigned
- Candidate submitted
- Submission status changed
- Interview feedback added
- Candidate rejected/selected/joined

---

## 9.5 Candidates Page

Purpose:

Show all candidates across all jobs.

Each row/card should show:

- Candidate name
- Email
- Phone
- Location
- Visa/work authorization
- Experience
- Skills
- Current company
- Resume/profile link
- Number of jobs submitted to
- Latest status
- Last updated date

Actions:

- Add candidate
- View candidate detail
- Edit candidate
- Search/filter candidates

Filters:

- Candidate name
- Skills
- Location
- Visa/work authorization
- Experience
- Current company
- Status
- Recruiter
- Date range

---

## 9.6 Add/Edit Candidate Page

Purpose:

Create or update a candidate profile manually.

Fields:

- Full name
- Email
- Phone
- Current location
- Visa/work authorization
- Total experience
- Current company
- Skills
- LinkedIn URL
- Resume upload or Google Drive link
- Notes

Validation:

- Candidate name required
- At least one contact field required: email or phone
- Warn/prevent duplicate candidates based on email/phone if possible

---

## 9.7 Candidate Detail Page

Purpose:

Show full candidate profile and history.

Sections:

### Candidate Profile

Show:

- Full name
- Email
- Phone
- Current location
- Visa/work authorization
- Experience
- Current company
- Skills
- LinkedIn
- Resume upload/link
- Notes

### Job Submission History

Show all jobs this candidate was submitted to.

Columns:

- Job title
- Client
- Vendor
- Sister company source
- Submitted by recruiter
- Submitted date
- Current status
- Final result
- Last updated date

### Interview History

Show interviews across all job submissions.

Columns:

- Job title
- Round name
- Interview type
- Interviewer
- Date/time
- Result
- Feedback

### Candidate Activity Timeline

Show all notes and updates for this candidate.

---

## 9.8 Submission Detail Page

Purpose:

Track one candidate for one job.

Example:

Candidate: John Smith  
Job: Java Developer  
Client: Apple  
Vendor: ABC Staffing  
Submitted by: Recruiter A

Sections:

### Submission Summary

Show:

- Candidate name
- Job title
- Client
- Vendor
- Sister company source
- Submitted by recruiter
- Submitted date
- Current stage
- Candidate rate
- Resume used/link
- Notes

### Status Pipeline

Show progress visually:

```text
Submitted → Resume Picked → Vendor Screening Call → Client Interview → Selected/Rejected/On Hold → Offer Released → Joined
```

### Interview Rounds

Show all interview rounds.

Each round should display:

- Round name
- Interview type
- Interviewer
- Interview date/time
- Result
- Feedback
- Notes
- Updated by
- Updated date

Actions:

- Add interview round
- Edit interview round
- Add feedback
- Update result

### Notes & Feedback

Users can add:

- Follow-up notes
- Rejection reason
- Interview feedback
- Client/vendor comments
- Internal comments

### Activity Timeline

Track every important update.

---

## 9.9 Recruiters Page

Purpose:

Show recruiter performance.

Each recruiter should show:

- Total jobs assigned
- Total submissions
- Total interviews
- Total selected candidates
- Total offer released
- Total joined candidates
- Total rejections
- Total on hold
- Recent activity

Filters:

- Day
- Week
- Month
- Year
- Custom date range
- Client
- Vendor
- Sister company source

---

## 9.10 Recruiter Detail Page

Purpose:

Show one recruiter's work.

Sections:

- Assigned jobs
- Candidates submitted
- Interviews achieved
- Selected candidates
- Joined candidates
- Rejections/on hold
- Recent activity
- Performance over time

---

## 9.11 Reports / Analytics Page

Purpose:

Provide management analysis.

Reports:

- Jobs by sister company source
- Jobs by client
- Jobs by vendor
- Submissions by recruiter
- Interviews by recruiter
- Selected candidates by recruiter
- Joined candidates by recruiter
- Candidate pipeline by stage
- Company/vendor/client-wise performance
- Open job aging report
- Submission-to-interview conversion
- Interview-to-selection conversion

Filters:

- Date range
- Recruiter
- Client
- Vendor
- Sister company source
- Job status
- Submission status

---

## 10. Search and Filtering Requirements

Global search should support:

- Candidate name
- Job title
- Client
- Vendor
- Sister company source
- Recruiter
- Skills
- Location

Filters should be available on major list/report pages:

- Recruiter
- Company/source
- Vendor
- Client
- Job title
- Candidate
- Status
- Date range
- Location
- Visa type
- Skills

---

## 11. File Handling

For MVP:

- Allow resume upload locally.
- Also allow users to paste a Google Drive link.
- A candidate may have a resume/profile link.
- A submission may reference the resume used for that specific job.

Do not build Google Drive integration now.

---

## 12. Duplicate Rules

Candidate duplicate detection:

- Warn if email already exists.
- Warn if phone already exists.

Submission duplicate prevention:

- A candidate can be submitted to multiple jobs.
- A candidate cannot be submitted more than once to the same job.
- Enforce unique candidate + job submission.

---

## 13. Audit and Timeline Rules

Every major action should create a timeline entry.

Examples:

- Job created
- Job edited
- Candidate created
- Candidate edited
- Candidate submitted to job
- Submission status changed
- Interview round created
- Interview result updated
- Feedback added
- Note added
- Resume updated
- Candidate marked selected
- Candidate marked rejected
- Offer released
- Candidate joined

The timeline should be visible in:

- Job detail page
- Candidate detail page
- Submission detail page

---

## 14. Suggested MVP Navigation

Sidebar/navigation:

1. Dashboard
2. Jobs
3. Candidates
4. Submissions
5. Recruiters
6. Reports
7. Settings, optional

Settings can include:

- Sister companies
- Clients
- Vendors
- Recruiters/users
- Status values, optional later

---

## 15. UX Guidelines

The UI should be:

- Clean
- Simple
- Business/professional
- Easy for non-technical users
- Desktop-first
- Table-heavy but not cluttered
- Filter/search friendly
- Dashboard cards and charts should be easy to understand

Avoid:

- Overly flashy animations
- Complex workflows
- Hidden actions
- Too many steps to update status
- Mobile-first complexity for MVP

Important UX principle:

> The user should be able to open a job and immediately understand how many candidates were submitted, who submitted them, and where each candidate stands.

---

## 16. Suggested MVP Build Order

Build in this order:

### Phase 1 — Foundation

- Project setup
- Database setup
- Basic layout/sidebar
- Basic user/recruiter model
- Seed sample data

### Phase 2 — Jobs

- Add/edit/list jobs
- Job detail page
- Job filters
- Sister company/client/vendor relationships

### Phase 3 — Candidates

- Add/edit/list candidates
- Candidate detail page
- Resume upload/link
- Duplicate candidate warning

### Phase 4 — Submissions

- Submit candidate to job
- Prevent duplicate candidate-job submission
- Submission detail page
- Status pipeline
- Notes

### Phase 5 — Interviews

- Add/edit interview rounds
- Unlimited interview rounds per submission
- Interview feedback/result tracking

### Phase 6 — Timeline/Audit

- Create timeline entries for key actions
- Show timeline on job/candidate/submission detail pages

### Phase 7 — Dashboard/Reports

- Dashboard metrics
- Recruiter performance
- Company/vendor/client reporting
- Date filters

---

## 17. Important Implementation Instruction for AI Agent

Do not assume missing business rules.

If something is unclear, ask before building.

Keep the app simple and internal.

Do not add features that were not requested:

- No public candidate portal
- No client portal
- No email automation
- No notifications
- No AI resume parsing
- No AI matching
- No complex permissions

Use the requirements in this file as the source of truth.

---

## 18. Suggested Technical Direction

This section can be adjusted later.

Recommended simple stack:

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- shadcn/ui
- Local file upload for resumes

Reason:

- Good for dashboard apps
- Fast to build
- Easy to deploy
- Works well for forms, tables, filters, and reports

For authentication, keep simple initially:

- Basic login
- User table
- Session-based auth

Do not over-engineer.

---

## 19. Acceptance Criteria

The MVP is acceptable when:

1. User can create job requirements.
2. User can create candidate profiles.
3. User can submit a candidate to a job.
4. Same candidate cannot be submitted twice to same job.
5. Submission has a status pipeline.
6. User can add unlimited interview rounds to a submission.
7. User can add feedback/notes.
8. User can mark candidate selected/rejected/on hold/offer released/joined.
9. Job detail page shows all submitted candidates and their statuses.
10. Candidate detail page shows all jobs the candidate was submitted to.
11. Recruiter page shows basic performance counts.
12. Dashboard shows jobs, submissions, stages, interviews, selections, joins.
13. Search and filters work on major pages.
14. Timeline/history is visible for jobs, candidates, and submissions.
15. Resume upload or Google Drive link works.
16. UI is understandable for non-technical users.

---

## 20. Final Summary

Build a centralized internal recruitment tracking dashboard that tracks:

- Incoming job requirements
- Source sister company
- Client and vendor
- Assigned recruiters
- Candidate submissions
- Interview rounds
- Feedback and notes
- Final outcomes
- Recruiter performance
- Dashboard analytics

Keep the MVP simple, manual, and internal.
Focus on visibility, tracking, and reporting.


---

# Copy-Paste Prompt for AI Coding Agent

```text
Use `PROJECT_REQUIREMENTS.md` as the source of truth and build the internal recruitment tracking dashboard described there.

Important instructions:
- Do not assume missing business rules.
- If anything is unclear, ask before implementing.
- Build this as a simple internal MVP.
- Do not add email integration, notifications, AI resume parsing, AI matching, client portal, candidate portal, or complex permissions.
- Focus first on jobs, candidates, submissions, interview rounds, notes, timelines, dashboard, and reports.
- Use clean professional UI suitable for non-technical recruiters/managers.
- Follow the phased build order in the requirements file.
- Before coding, review the requirements and give me:
  1. your understanding of the app,
  2. proposed database models,
  3. page/routes plan,
  4. build phases,
  5. any questions you need answered.

```
