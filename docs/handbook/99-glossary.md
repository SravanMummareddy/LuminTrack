# 99 — Glossary

Every project-specific term, alphabetised, with what it means and
where in the codebase to look.

### Activity
Audit-log entry. One row per meaningful write. See
[`09-audit-and-timeline.md`](./09-audit-and-timeline.md). Polymorphic
(JOB / CANDIDATE / SUBMISSION / INTERVIEW_ROUND).

### Admin
A `User` with `role = ADMIN`. Has access to org-entity management,
the iLabor importer, the audit page, recruiter creation, and the
default org-wide Dashboard scope.

### Advisory lock
A Postgres process-coordination primitive: `pg_try_advisory_xact_lock(N)`
takes a "lock" identified by an integer. Used to serialise concurrent
iLabor imports — see
[`10-imports-and-display-ids.md`](./10-imports-and-display-ids.md).

### Audit
Synonym for **Activity** in conversation. The `/audit` page is the
admin-only global feed.

### Candidate
A person we could submit to a job. `Candidate` model. Lives
independently of any one Job. Has a résumé library
(`CandidateResume`).

### CandidateResume
A labelled Google Drive link saved against a Candidate. One
Candidate, many Resumes. Submissions reference the chosen one and
snapshot its URL.

### Client
The actual hiring company. The end employer. `Client` model.

### Contact
A per-org-entity contact person — name + email + phone + role.
Polymorphic FK (Client / Vendor / Source).

### Display ID
Human-readable record ID — `JOB-00123`, `REQ-159263`, `CAND-001`,
`SUB-001`. Backed by `seq Int @unique @default(autoincrement())`
columns. Formatters in `src/lib/format.ts`.

### Featured skills
≤3 starred skills on a Candidate, surfaced first on list views and
in chip walls. Subset of `skills[]` (Zod-enforced).

### iLabor
Randstad's vendor management system. We import requisitions from
it as Jobs. Modelled by `JobPortal` ("Randstad iLabor") +
`Job.portalId` + `Job.portalRefId`.

### Job
A requirement to hire someone. `Job` model. Has a Client, a Vendor,
a Source.

### JobAssignment
The recruiter ↔ Job many-to-many link. Explicit so it can be
audited.

### JobPortal
An external system we import jobs from. Today just one: iLabor.

### Note
A free-text comment attached to a Job / Candidate / Submission /
InterviewRound. Immutable. Polymorphic FK.

### Portal
Conversational synonym for **JobPortal**.

### Recruiter
A `User` with `role = RECRUITER`. The day-to-day worker.

### REQ
The prefix for an iLabor-imported job's display ID
(`REQ-159263`). Uses iLabor's own `portalRefId`, no padding.

### Round
Shorthand for **InterviewRound**. One interview event under a
Submission. Submissions can have many.

### Scope (Dashboard)
The `?scope=me|org` toggle on `/`. Recruiters default to `me`,
admins to `org`.

### Seq
The `seq Int @unique @default(autoincrement())` column on Job /
Candidate / Submission. Human-friendly monotonic counter that
backs the display IDs.

### SisterCompanySource
The partner company that forwarded a requirement to us. Often
called just **Source** in conversation. Distinct from Vendor and
Client.

### Source
Conversational synonym for **SisterCompanySource**. Don't confuse
with `Candidate.source` (a free-text field describing how a
specific candidate came to us — "LinkedIn", "Referral", etc.).

### SUB
The prefix for a Submission's display ID: `SUB-001`.

### Submission
The act of putting a Candidate forward for a Job. `Submission`
model. Has a status pipeline:
`SUBMITTED → RESUME_PICKED → VENDOR_SCREENING_CALL →
CLIENT_INTERVIEW → SELECTED / REJECTED / ON_HOLD → OFFER_RELEASED
→ OFFER_ACCEPTED → JOINED`.

### Tag
A lowercased free-text label on a Candidate, e.g. "hot prospect."
Different from a **skill**.

### Timeline
The audit feed on a detail page. Driven by `getTimelineFor()`,
which rolls up an entity's activity with its descendants'.

### Vendor
The staffing/agency layer between us and the client.

### Work mode
`REMOTE | HYBRID | ONSITE`. Job field.
