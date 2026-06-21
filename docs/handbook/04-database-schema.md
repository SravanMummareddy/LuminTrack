# 04 — Database schema

> **In plain English.** The "shape" of every record in Postgres,
> drawn so you can see how Jobs, Candidates, Submissions, and the
> rest fit together. The single source of truth is
> [`prisma/schema.prisma`](../../prisma/schema.prisma) — when in
> doubt, open that file.

## The relationship diagram

```
                         SisterCompanySource
                                  │
                                  ▼ (optional)
   Client ─────────────► JOB ◄──────── Vendor
                          │
                          │ JobAssignment (M:N) ─── User (recruiter)
                          │
                          │
                          ▼
                      SUBMISSION ────────── User (submittedBy)
                          │
                          │ ┌─ CandidateResume (snapshot link)
                          │ │
                          ▼ ▼
                      CANDIDATE
                          │
                          ├─ CandidateResume[] (résumé library)
                          ▼
                      InterviewRound (under each Submission)

                Note      (polymorphic — points at exactly one of
                Activity   Job / Candidate / Submission / Round)

                JobPortal (e.g. iLabor) ──► Job.portalId + portalRefId
                Contact   (per Client/Vendor/Source)
```

## Identity columns

Every primary model has two ID columns:

- `id String @id @default(cuid())` — the surrogate primary key; what
  FKs point at, what URLs use.
- `seq Int @unique @default(autoincrement())` — the human-friendly
  monotonic counter, surfaced as `JOB-00123`, `CAND-001`, `SUB-001`
  via formatters in `src/lib/format.ts`.

We keep both because:
- `id` is stable across imports and lets us merge data sources.
- `seq` reads nicely in conversations: "Did you see candidate 47?"

## The org entities

These are the small tables that anchor everything else.

| Model                  | Why it exists                                                                        |
|------------------------|--------------------------------------------------------------------------------------|
| `User`                 | Recruiters + admins. `role: ADMIN | RECRUITER`. Soft-deleted via `isActive`.         |
| `Client`               | The hiring company. Unique by name.                                                  |
| `Vendor`               | The staffing/agency layer.                                                           |
| `SisterCompanySource`  | The "sister company" that forwarded the requirement.                                 |
| `JobPortal`            | External requisition systems we import from (iLabor, etc.).                          |
| `Contact`              | Per-entity contact people. Polymorphic: exactly one of `clientId`/`vendorId`/`sourceId` is set. |

The three org tables (Client, Vendor, Source) all have the same
columns. We kept them as separate tables (vs. one with a `kind` column)
because:
- Each plays a distinct role in the business flow.
- Foreign keys from `Job` are more readable
  (`job.client.name` vs `job.party_a.name`).
- Future fields will diverge (clients eventually get rate cards,
  sources eventually get markup %, etc.).

## The big three: Job, Candidate, Submission

### Job

The requirement. Heavy table because it carries both *our* fields and
the *iLabor-imported* fields (all the iLabor columns are nullable —
manual jobs ignore them).

Notable columns:
- `vendorRate`, `candidateRate` — `Decimal(12, 2)`. Flattened to
  `string`/`number` in queries before sending to Client Components
  (Decimal is not serialisable across the RSC boundary).
- `status: JobStatus` — `OPEN | ON_HOLD | CLOSED | FILLED | CANCELLED`.
- `sisterCompanySourceId` (nullable) + `sourceOther` (free text) —
  one of these is set. `jobSourceLabel(job)` in `src/lib/labels.ts`
  picks the right one.
- `portalId` + `portalRefId` — together form the upsert key for
  re-imports. The schema has `@@unique([portalId, portalRefId])`.
- `lastImportedAt` — set when iLabor (re)imports a job; powers the
  /jobs/imports history view.
- iLabor-flavoured nullable columns: `atsId`, `startDate`, `endDate`,
  `durationLabel`, `positions`, `externalSubsCount`, `externalActiveCount`,
  `releasedDate`, `assignedToName`, `ownerName`, `ownerAltEmail`,
  `reqType`, `department`, `externalStatusRaw`, `externalCreatedDate`.
- LuminTrack-native planning columns: `workMode`, `priority`,
  `targetCloseDate`, `postingUrl`, `workAuthRequirement`, `skills[]`.

### Candidate

A person. Separate from the Job — a Candidate can be submitted to
many Jobs over time.

Notable columns:
- `status: CandidateStatus` — `AVAILABLE | PLACED | NOT_INTERESTED |
  DO_NOT_CONTACT`. Distinct from `isActive` (which is soft-delete).
- `isActive` — soft-delete flag. Falsey rows are excluded from the
  Candidates list by default but still referenced by historic
  submissions.
- `tags[]` — lowercased free-form labels ("hot prospect", etc.).
- `lastContactedAt` — bumped only by the explicit "Mark contacted"
  button, not by every edit. Otherwise it'd mirror `updatedAt`.
- `source` — free text for now ("LinkedIn InMail", "Referral",
  "Indeed", etc.). Fixed enum was considered and rejected.
- `featuredSkills[]` — the ≤3 starred skills shown first in list
  views. Must be a subset of `skills` (enforced in Zod, not DB).
- `resumeBlobUrl` — placeholder for when Vercel Blob is provisioned;
  today the actual résumé links live in `CandidateResume`.

### Submission

The join table with state. **The most interesting model in the app.**

```
SubmissionStatus pipeline (one-way arrows in practice, but the schema
doesn't enforce ordering — the status column is a free assignment):

  SUBMITTED
   └─► RESUME_PICKED
       └─► VENDOR_SCREENING_CALL
           └─► CLIENT_INTERVIEW
               ├─► SELECTED  ──► OFFER_RELEASED ──► OFFER_ACCEPTED ──► JOINED
               ├─► REJECTED
               └─► ON_HOLD
```

Notable columns:
- `status` — current pipeline stage. Changes through
  `updateSubmissionStatus` action, which also captures `eventAt`,
  `note`, and `reason` on the audit row.
- `duplicateReason` — set when a recruiter consciously submits the
  same candidate to the same job again. The DB-level `@@unique
  ([candidateId, jobId])` was *dropped* (migration
  `20260526150000_interview_tz_and_dup_override`) so the duplicate
  check now lives in `createSubmission` and can be overridden with
  a reason captured here.
- `resumeDriveLink` — a **snapshot** of the Drive link at the time of
  submission. `candidateResumeId` is the FK to the live résumé
  library row (`onDelete: SetNull`). We keep both: if the library entry
  is edited the snapshot still shows what was sent, and if it's ever
  hard-deleted the FK clears but the snapshot survives. Note résumés are
  now **archived** (soft delete), not hard-deleted, in the normal case —
  so the FK link is preserved, not severed (see `CandidateResume` below).
- `expectedJoinDate`, `actualJoinDate` — set when status moves to
  `OFFER_ACCEPTED` and `JOINED` respectively.

## Interview rounds

`InterviewRound` is per-submission. Many rounds per submission.

Notable columns:
- `roundOrder` (int) + `roundName` (free text). Recruiters often go
  "Round 1 — Vendor Screen", "Round 2 — Manager", "Round 3 — HR".
- `interviewType: InterviewType` — `VENDOR_SCREENING | CLIENT_INTERVIEW
  | MANAGER_ROUND | HR_ROUND | FINAL_ROUND | OTHER`.
- `interviewMode` (`IN_PERSON | PHONE | VIDEO`) + `interviewPlatform`
  (`Teams | Google Meet | Zoom | Other`, only when mode is VIDEO).
- `meetingLink` — optional URL; surfaces as a "Join" button on the
  round card.
- `scheduledAt` — UTC.
- `scheduledTimezone` — IANA name ("America/New_York"). Captures the
  interviewer's intent (so a Pacific recruiter doesn't accidentally
  ship a London candidate Pacific-local time).
- `result: InterviewResult` — `WAITING | NEED_ANOTHER_ROUND | SELECTED
  | REJECTED | ON_HOLD | COMPLETED`.

## The polymorphic tables: Note and Activity

Both `Note` and `Activity` have **four nullable FK columns**
(`jobId`, `candidateId`, `submissionId`, `interviewRoundId`) plus an
`entityType` enum discriminator. The invariant: exactly one FK is set
and matches `entityType`.

We didn't model this as separate tables per entity because:
- The query "show me everything that's ever happened to this job"
  becomes one indexed lookup.
- The polymorphic pattern is well-supported by indexes; we have one
  per FK plus one on `createdAt`.
- The downside (no DB-level "exactly one is set" check) is bounded —
  only the action layer writes these rows, and `logActivity()` always
  sets exactly one.

`Activity.eventAt`, `Activity.note`, `Activity.reason` are extra
context captured on status changes (when did it really happen, what
note did the recruiter type, what preset reason did they pick).

## The other small tables

- `CandidateResume` — labelled Drive links per candidate. 1:N from
  Candidate. A Submission optionally points at one via
  `candidateResumeId`. Has `isActive` (default true): "removing" a
  résumé **archives** it (`isActive = false`) rather than deleting the
  row, so submissions keep their live link; archived résumés are hidden
  from the library's active list and the submit picker but can be
  restored. A true hard delete is allowed only when the résumé has zero
  submissions (migration `20260530052124_resume_soft_delete`;
  `@@index([candidateId, isActive])`).
- `JobAssignment` — recruiter ↔ job many-to-many, but explicit so it
  can be audited. Has `assignedBy` + `assignedAt`.
- `JobPortal` — one row per external system we import from. Today
  there's effectively only one: iLabor.
- `Contact` — per-entity contact records. Cascade-deleted with their
  parent.

## Indexing

Every FK column has an index. Every "filterable on the list page"
column has an index (status, createdAt, submittedAt). The polymorphic
tables have an extra `@@index([createdAt])` to keep timeline queries
fast.

## Migrations

`prisma/migrations/<timestamp>_<name>/migration.sql` — every schema
change has one. We never edit old migrations. To change a column,
write a new migration. Run them via `npm run db:migrate`.

A few notable historic ones (search by date in the folder):
- `20260524160000_display_sequences` — added `seq Int` everywhere.
- `20260524180000_job_imported_action` — extended the
  `ActivityAction` enum with `JOB_IMPORTED`.
- `20260525120000_interview_meeting_link` — added `meetingLink`.
- `20260526150000_interview_tz_and_dup_override` — added
  `scheduledTimezone` and `duplicateReason`, dropped the unique
  index on `(candidateId, jobId)`.
- `20260526140000_candidate_status_tags_contact_source` — added the
  candidate engagement columns.
