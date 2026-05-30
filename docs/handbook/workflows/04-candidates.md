# Workflow 04 — Candidates

> **In plain English.** The pool of people we could put forward.
> Each candidate lives independently of any specific job — you can
> add them once and submit them to many jobs over time. Each
> candidate keeps a *library* of résumés (labelled Google Drive
> links).

**Who uses it:** everyone.

## The list page (`/candidates`)

**What you see.**

- Page header + "Create candidate" button.
- FilterBar: status (Available / Placed / Not interested / Do not
  contact), recruiter, location, work auth, source, tags, date
  range, text search.
- Table: 10/page, sortable, column show/hide.

**Default columns visible.** S.No · ID · Name · Email · Phone ·
Location · Experience · Subs · Updated.

**Hidden by default.** Skills, Work auth, Current company. Toggle in
Columns menu.

**Skills column behaviour.** Shows max 3 chips. Prefers
`featuredSkills[]` (the ≤3 starred ones); falls back to first 3 of
`skills[]`. Overflow becomes a `+N` chip with the rest as a tooltip
title.

**Inactive candidates** are hidden by default (filter toggle restores
them).

## Create / edit candidate

**The form.** Sections:

- Identity: full name, email, phone, current location, LinkedIn URL.
- Profile: current company, work authorization, total experience
  years, skills (comma-separated), featured skills (≤3 starred from
  the skills list).
- Engagement: **Status** dropdown (Available / Placed / Not interested
  / Do not contact), **Source** (free text: "LinkedIn InMail",
  "Referral", "Indeed", etc.), **Tags** (comma-separated).
- Notes.

**Every button + what it does**

- **Save** → `createCandidate` / `updateCandidate`. Audit:
  `CANDIDATE_CREATED` / `CANDIDATE_UPDATED`.
- **Cancel** → back to `/candidates`.

**Validation** — see `src/lib/validation/candidate.ts`. Notable:
- Email format if provided; phone is free text.
- Total experience: 0 or positive decimal.
- Featured skills must be a subset of skills.
- Status and source are independent (a "PLACED" candidate can still
  have a source recorded).

## Candidate detail (`/candidates/<id>`)

**Layout.**

- Page header: name, candidate display ID, status badge, source line,
  last-contacted line, "Mark contacted" button, "Edit" link.
- Profile card: contact info, LinkedIn, location, work auth, current
  company, experience, skills chip wall.
- **Tags chip row** — clickable to filter the candidates list by that
  tag.
- **Résumé library** — per-candidate list of `CandidateResume` rows
  (label + Drive link). Inline preview via Google Drive's embedded
  viewer. Shows **active** résumés by default; archived ones sit behind
  a "Show archived (N)" chip with an *Archived* badge + Restore.
- **Interview history (grouped by job)** — each row is one job the
  candidate's been submitted to, with pip indicators (✓ pass / ✗ fail
  / ⌛ pending) per round and a `<details>` expand to see the round
  cards.
- **Submissions sub-table** — paginated 5/page (`?subs=`).
- **Activity timeline** + **Notes** (same pattern as Job detail).

**Every interactive element**

- **Mark contacted** → `markCandidateContacted(id)` action. Bumps
  `lastContactedAt` and writes a `CANDIDATE_CONTACTED` audit row.
  Pure user-initiated event — never auto-bumped on edits.
- **Edit** → `/candidates/<id>/edit`.
- **Add résumé** → opens `ResumeForm` (`src/components/candidates/
  resume-form.tsx`); calls `createResume` action; writes
  `RESUME_ADDED`.
- **Edit résumé** → `updateCandidateResume`; audit `RESUME_UPDATED`.
- **Archive / Restore résumé** → `archiveCandidateResume` /
  `restoreCandidateResume` (soft delete via `isActive`); audit
  `RESUME_ARCHIVED` / `RESUME_RESTORED`. Archiving keeps the row so
  submissions stay linked. **Delete permanently** (`deleteCandidateResume`,
  audit `RESUME_DELETED`) only appears for a résumé with zero
  submissions.
- **Submit to a job** button → `/submissions/new?candidateId=<id>`.

## Code map

- List page: `src/app/(dashboard)/candidates/page.tsx`.
- Detail page: `src/app/(dashboard)/candidates/[id]/page.tsx`.
- Table: `src/components/candidates/candidates-table.tsx`.
- Filters: `src/components/candidates/candidate-filters.tsx`.
- Form: `src/components/candidates/candidate-form.tsx`.
- Mark contacted: `src/components/candidates/mark-contacted-button.tsx`.
- Résumé section: `src/components/candidates/resume-section.tsx`,
  `resume-form.tsx`.
- Interview history (grouped): `src/components/candidates/
  candidate-interviews-grouped.tsx`.
- Actions: `src/server/actions/candidates.ts`, `resumes.ts`.
- Queries: `src/server/queries/candidates.ts`.

## Why we built it this way

- **Status separate from isActive.** `isActive=false` is for
  spam/duplicate cleanup. `status=DO_NOT_CONTACT` records the
  candidate's wish without losing their history. They're different
  concepts.
- **Tags free-form.** A fixed taxonomy would calcify before the team
  learns what labels matter. Lowercased + trimmed in the action.
- **lastContactedAt explicit.** If we bumped it on every edit, it'd
  just mirror `updatedAt` and lose meaning. The "Mark contacted"
  button is the only way to bump it.
- **Featured skills.** The full skills list often runs 10+ entries.
  ≤3 starred skills shown first keeps the card scannable.
- **Résumé library + snapshot link on submission.** A candidate
  often has different résumés for different role types
  (frontend-leaning vs backend-leaning). We keep the library and
  snapshot the chosen link on the Submission so history survives
  later edits/deletes.
- **Interview history grouped by job.** Originally a flat list of
  rounds; recruiters complained they couldn't see "what happened
  for the Apple job specifically." Grouping by job + per-round pips
  fixed it.
