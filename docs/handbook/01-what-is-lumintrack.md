# 01 — What is LuminTrack

> **In plain English.** LuminTrack is the internal "scoreboard" for a
> small recruiting team. A job comes in from a partner company, the
> team sends candidates to it, those candidates get interviewed, and
> someone eventually gets hired (or doesn't). LuminTrack tracks every
> step of that journey so a recruiter or manager can answer "who is
> doing what, and how's it going?" without digging through Excel
> sheets and Word docs.

## The team it serves

- **Under 10 recruiters.** This is not a SaaS for thousands of users —
  it's a focused internal tool. Decisions optimize for clarity over
  scalability.
- **One company, multiple roles.** Two user roles exist: `ADMIN`
  (can manage organisation entities, see all data, run imports) and
  `RECRUITER` (the day-to-day worker). Everyone can see most things;
  admin gates apply to destructive/structural actions.

## The problem it replaces

Before LuminTrack: a shared Excel workbook with one tab per job, a
Word doc per candidate, and a chat thread where statuses got
announced. Things slipped — duplicate submissions, missing feedback,
no audit trail, no "how many joins did Priya have last quarter?"
report.

LuminTrack centralises all of that into one Postgres database with a
visible audit log on every record.

## The vocabulary (and why words matter)

Recruiting has overlapping words for similar concepts. The handbook
and the code use these terms strictly. Memorise them — confusion
between *source*, *vendor*, and *client* is the #1 thing that trips
new people.

| Term         | Meaning                                                                              | Example                |
|--------------|--------------------------------------------------------------------------------------|------------------------|
| **Client**   | The actual hiring company. The end employer.                                         | Apple                  |
| **Vendor**   | The staffing/agency company between us and the client (sometimes us, often not).     | ABC Staffing           |
| **Source**   | The "sister company" or partner who forwarded the requirement to us.                 | Lumin Sister Co. India |
| **Portal**   | An external requisition system (e.g. Randstad's "iLabor") we *import* jobs from.     | iLabor                 |
| **Job**      | A requirement to hire someone. Owned by us, references a Client + Vendor + Source.   | "Senior Java Dev"      |
| **Candidate**| A person we could submit. Lives in our own database, not tied to a job yet.          | Priya Kumar            |
| **Submission** | The act of putting a Candidate forward for a Job. Has a *status pipeline*.         | "Priya → Java Dev job" |
| **Round**    | One interview event within a Submission. A Submission can have many rounds.          | "Round 2 — Manager"    |
| **Note**     | A free-text comment attached to any Job/Candidate/Submission/Round.                  | "Salary expectation 25 LPA" |
| **Activity** | An audit-log entry. Every meaningful write generates one.                            | "Submission status: SELECTED" |

## The core business flow

```text
   ┌────────────┐
   │ Source     │ (sister company forwards a requirement)
   │ + Vendor   │
   │ + Client   │
   └─────┬──────┘
         │
         ▼
   ┌────────────┐       ┌──────────────┐
   │  JOB       │◄──────│ Recruiter    │ (admin/recruiter creates
   │ (OPEN)     │       │ assignments  │  the Job, assigns recruiters)
   └─────┬──────┘       └──────────────┘
         │
         │  Recruiter picks a candidate from the Candidates table
         │  (or creates a new one), attaches a résumé from that
         │  candidate's résumé library, optionally writes a note.
         ▼
   ┌────────────────────────────────────────────────────┐
   │ SUBMISSION                                         │
   │   status pipeline:                                 │
   │     SUBMITTED → RESUME_PICKED → VENDOR_SCREENING_CALL
   │     → CLIENT_INTERVIEW → SELECTED → REJECTED       │
   │     → ON_HOLD → OFFER_RELEASED → OFFER_ACCEPTED    │
   │     → JOINED                                       │
   └─────┬──────────────────────────────────────────────┘
         │
         │  As things happen, recruiters update the status, add
         │  interview rounds, attach feedback as notes. Every
         │  change writes an Activity row (the audit log).
         ▼
   ┌────────────┐
   │ JOINED     │ (the happy ending — candidate started working)
   └────────────┘
```

Everything in the app is a view onto some slice of this graph:

- `/jobs` — the list of Jobs.
- `/candidates` — the list of Candidates.
- `/submissions` — the join table between them, with status.
- `/dashboard` — KPIs aggregated from all three.
- `/reports` — slower, deeper aggregations (time-to-fill, etc.).
- `/audit` — the raw Activity log (admin only).

## What LuminTrack is NOT

(from the original requirements doc — these limits are deliberate)

- Not a public job board.
- Not a candidate portal — candidates never log in.
- Not a client portal — clients never log in.
- Not an ATS with email automation or AI matching.
- Not mobile-first (mobile *works*, but desktop is the primary target).

When in doubt, the project's North Star is: "would a senior recruiter
on this 10-person team look at this and immediately understand what
to do next?" If yes, ship it. If it requires a tutorial, simplify.

## What's been built so far

All 7 original build phases (Foundation/Auth, Jobs, Candidates,
Submissions, Interview Rounds, Notes/Timeline, Dashboard+Reports)
are complete. On top of that:

- **iLabor import** — bulk import jobs from Randstad's iLabor portal
  (Phases 0–8a done; the browser extension that scrapes iLabor is the
  one remaining piece, lives in a separate repo).
- **Polish rounds** — column pickers, responsive tables, sub-table
  pagination, focus traps, status pipeline event metadata,
  candidate status/tags/source, interview meeting links.
- **Reports** — recruiter aging, client revenue projection, time-to-fill,
  time-in-stage, joined %.

The full list lives in [`../../CLAUDE.md`](../../CLAUDE.md). Open
items (large features) are in
[`../../ENHANCEMENTS.md`](../../ENHANCEMENTS.md); bug backlog in
[`../../bugs.md`](../../bugs.md).
