# SD 04 — "What would you do differently?"

> Interviewers love this question. The wrong answer is "nothing,
> it's perfect." The right answer is a short, honest list with
> *reasoning*. Reflects maturity.

## The five things I'd change

### 1. Move the duplicate-submission check to the action layer from day one

**What I did:** Started with `@@unique([candidateId, jobId])` on
the DB. Later (migration `20260526150000`) had to drop it and
move the check to the action layer with a captured override
reason — see story 05.

**What I'd do:** Build the action-layer check first. Keep the
audit row's `duplicateReason` field from day one. Avoid the
two-phase migration.

**Why:** Even a clean migration has risk. Avoiding it altogether
beats executing it well.

### 2. Add a `loading.tsx` per slow segment

**What I did:** Skipped loading boundaries because queries felt
fast.

**What I'd do:** Add a skeleton `loading.tsx` next to each
`page.tsx` for routes that aggregate (Dashboard, Reports). Even
on a fast query, a skeleton makes perceived performance better
on slow networks.

**Why:** Cheap to add early; harder to retrofit consistently
later.

### 3. Write a small test suite earlier

**What I did:** No tests. Verified manually. Worked because the
app is small and one person built it.

**What I'd do:** A handful of integration tests that hit the
real DB through actions — `createJob`, `updateSubmissionStatus`,
`importRequisitions`. Not unit tests of components; not exhaustive
coverage; just a regression net for the actions.

**Why:** Manual verification doesn't scale to a team of two.
The cost of writing tests at the start is small; the cost of
backfilling them later is high.

### 4. Track real telemetry, not just `recently-viewed`

**What I did:** `src/lib/analytics.ts` is just a localStorage
"recently-viewed" list. No real telemetry.

**What I'd do:** Add Vercel Analytics or PostHog with thin
events — "Job created," "Submission status changed,"
"Dashboard scope toggled." Watch which features are actually
used vs ignored before adding more.

**Why:** Without data, the next prioritisation decision is a
guess.

### 5. Don't put `featuredSkills` constraint in Zod

**What I did:** Enforced "featured skills must be a subset of
skills" in Zod's `superRefine`.

**What I'd do:** Either compute `featuredSkills` from a `starred`
flag on each skill, or store skills as a structured array
`{ name, featured }`. The current shape lets the two arrays
drift (theoretically), and the Zod check duplicates intent the
data shape should express.

**Why:** Schemas that allow invalid states and rely on
validation are weaker than schemas that make invalid states
unrepresentable.

## What I would NOT change

- The audit-log invariant. It's load-bearing for the whole app's
  value.
- The Server Component default + Server Action mutation pattern.
- Hand-rolled auth (for this scale and provider mix).
- The responsive-table descendant-variant trick.
- The `useColumnPrefs` render-then-hydrate pattern.

## How to answer this in the room

Pick *two* items. Be specific. Explain the trade-off you
*originally* made, why it was reasonable then, and what you'd
change with the benefit of hindsight.

Bad answer:

> "I'd add more tests."

Better answer:

> "I'd write four or five integration tests against the actions
> — `createJob`, `updateSubmissionStatus`, `importRequisitions`,
> `loginAction`. Not coverage-driven, just a regression net. I
> got away without them because I was the only developer and
> verified manually. The cost of adding them at the start would
> have been an hour; retrofitting them now while features keep
> landing is harder."

## Watch out for

- Don't pile on. "Everything is wrong" sounds insecure.
- Don't pick something you'd literally do *the same way* — the
  interviewer can tell.
- Don't blame the framework, the team, or the timeline. Own it.
