# SD 02 — Drawing the ERD live

> Use this when asked to "design the database for X" or "walk me
> through your schema." The trick is to start with the *story*,
> not the tables.

## The story-first opener (60 seconds)

> "Before I draw tables, here's the business flow: a Job comes
> from a Source (sister company) with a Vendor and a Client.
> Our recruiters submit Candidates for that Job. Each
> Submission has a status that walks a pipeline. Submissions can
> have multiple Interview Rounds. Notes can be attached to any
> of those. And every change writes an audit row."

Pause. Then start drawing.

## What to draw, in order

### 1. The org entities (1 minute)

```
[Client]   [Vendor]   [SisterCompanySource]   [JobPortal]
```

Talk: "These are the small reference tables. Each is just
`name`, contact fields, an `isActive` for soft-delete. JobPortal
is for external systems we import from — iLabor."

### 2. The big three (2 minutes)

```
[Client]  [Vendor]  [Source]
    \       |       /
     \      |      /
      ▼     ▼     ▼
      ┌──────────┐
      │   Job    │◄── createdBy (User)
      └────┬─────┘
           │
           │  (1-to-many)
           ▼
      ┌────────────┐
      │ Submission │◄── submittedBy (User)
      │ status: …  │
      └────┬───────┘
           │
           ▼
      ┌──────────────────┐
      │ InterviewRound   │
      │ result: …        │
      └──────────────────┘

      [Candidate] ──── many → [Submission]   (the join)
```

Talk: "Each Submission ties one Candidate to one Job. It
carries the pipeline status — Submitted, Resume Picked, Vendor
Screening, Client Interview, Selected, Rejected, On Hold, Offer
Released, Offer Accepted, Joined. Interview Rounds live under
the Submission."

### 3. The polymorphic tables (1 minute)

```
[Note]      [Activity]
   │            │
   ▼            ▼
attaches to ONE of:
   [Job] | [Candidate] | [Submission] | [InterviewRound]
```

Talk: "Note and Activity each have four nullable FKs plus an
`entityType` discriminator. Exactly one FK is set, matching the
discriminator. Activity is my audit log; every mutation writes
one inside the same transaction."

### 4. The supporting cast (30 seconds)

```
[CandidateResume]  belongs to [Candidate]
                   referenced (snapshot) by [Submission]

[JobAssignment]  M:M  [Job] ↔ [User]
                  explicit so we can audit assignments

[Contact]  belongs to ONE of [Client/Vendor/Source]
```

Talk: "CandidateResume is the per-candidate résumé library — a
candidate keeps multiple labelled Drive links. Submission picks
one and *snapshots* its URL so history survives later edits to
the library entry. JobAssignment is an explicit join so we can
audit who-assigned-whom. Contact is polymorphic to the three
org entities."

## Notes you can add as bullets

- Identity: `id` (cuid) for FKs and URLs; `seq Int @unique
  @default(autoincrement())` for human display IDs
  (`JOB-00123`, `CAND-001`, `SUB-001`).
- Money: `DECIMAL(12, 2)`. Flattened to strings when crossing
  the RSC boundary.
- Times: `DateTime` = UTC `timestamptz`. Interview rounds carry
  a `scheduledTimezone` IANA name separately.
- Indexes: every FK + every common WHERE column. Audit table has
  an extra `@@index([createdAt])` for timeline queries.

## Talking points if pressed

- "Why polymorphic over per-entity tables?" → Concept 08.
- "Why `seq` AND `id`?" → Display IDs need monotonic counters;
  FKs need stable opaque IDs.
- "Why no separate Outcomes table?" → SubmissionStatus *is* the
  outcome — `JOINED`, `REJECTED`, `OFFER_RELEASED` are terminal
  values in the same enum.
- "How would you handle multi-currency rates?" → Today not
  needed; would add a `currency` column and either keep Decimal
  + a 3-letter code, or move to integer minor units.

## Things to NOT draw on the first pass

- Every index. (Mention they exist; draw them if asked.)
- Every column. (Mention the interesting ones; the interviewer
  cares about the shape.)
- Migrations. (Mention you have them, version-controlled.)

## Closing line

> "If I were starting over at the same scale, I'd keep this
> shape. The thing I'd change is moving the duplicate-submission
> check to the action layer from day one, instead of starting
> with a DB unique constraint and dropping it later."
