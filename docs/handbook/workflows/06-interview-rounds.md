# Workflow 06 — Interview rounds

> **In plain English.** When a candidate gets an interview, we add a
> "round" under their submission. A submission can have many rounds.
> Each round records when it's scheduled, who's interviewing, what
> kind of round (manager, HR, technical, etc.), and the outcome
> (selected, rejected, on hold, waiting for next, etc.).

**Who uses it:** everyone.

**Where to find it:** under the submission detail page
(`/submissions/<id>`), in the "Interview rounds" section. There is
no standalone `/rounds` list — rounds always belong to a submission.

## Adding a round

Click "Add round" → `InterviewRoundForm` opens.

**Fields**

- **Round name** (free text) — "Round 1 — Vendor Screen", "R2 —
  Manager", etc.
- **Round order** (int) — auto-defaulted to `max + 1` for the
  submission.
- **Interview type** — `VENDOR_SCREENING | CLIENT_INTERVIEW |
  MANAGER_ROUND | HR_ROUND | FINAL_ROUND | OTHER`.
- **Interview mode** — `IN_PERSON | PHONE | VIDEO`.
- **Interview platform** (only when mode = VIDEO) — Teams / Google
  Meet / Zoom / Other.
- **Meeting link** (optional URL) — join URL for video / phone bridge.
  Renders as a "Join" button on the round card.
- **Interviewer name** (free text).
- **Scheduled at** (datetime).
- **Scheduled timezone** — IANA name ("America/New_York", "Asia/Kolkata").
  The `scheduledAt` is UTC; this captures the *intent* so a Pacific
  recruiter doesn't accidentally ship a London candidate Pacific-local.
- **Result** — `WAITING` initially. Updated later via the same form
  in "Edit round" mode.
- **Feedback** + **Notes** (optional text).

**Audit row.** `INTERVIEW_ROUND_ADDED` on create;
`INTERVIEW_RESULT_UPDATED` when the result changes;
`INTERVIEW_RESCHEDULED` when `scheduledAt` moves;
`INTERVIEW_ROUND_DELETED` on delete.

## The rounds manager UI

`src/components/interviews/interview-rounds-manager.tsx` renders a
stack of per-round cards. Each card shows:

- Round number + name + type chip.
- Date/time + timezone.
- Mode + platform + "Join" link if `meetingLink` set.
- Interviewer name.
- Result badge (color-coded).
- Feedback (if any).
- Edit / Delete buttons.
- The Round's note thread (notes attached to the round itself, not
  the submission).

The "Add round" button is at the bottom of the stack.

## Result transitions

`InterviewResult` values:

| Value                | Meaning                                                     |
|----------------------|-------------------------------------------------------------|
| `WAITING`            | Scheduled but result not in yet.                            |
| `NEED_ANOTHER_ROUND` | Passed but client wants another round.                      |
| `SELECTED`           | Cleared — moves the submission forward.                     |
| `REJECTED`           | Failed.                                                     |
| `ON_HOLD`            | Pending some external thing.                                |
| `COMPLETED`          | Done, no further interpretation (e.g. an HR check-in).      |

Changing the result does NOT auto-change the parent Submission's
status — that's a separate, explicit action. Coupling them silently
caused confusion in early testing.

## Code map

- Manager: `src/components/interviews/interview-rounds-manager.tsx`.
- Form: `src/components/interviews/interview-round-form.tsx`.
- Action: `src/server/actions/interviews.ts` (create / update /
  reschedule / delete).
- Schema: `src/lib/validation/interview.ts`.
- Query: `src/server/queries/interviews.ts` (used by the candidate
  interview-history view).

## Why we built it this way

- **No standalone /rounds page.** A round without its submission is
  context-less. Forcing the rounds to live inside the submission
  detail keeps the mental model clean.
- **Meeting link as URL field.** Recruiters used to paste Zoom links
  into notes; candidates had to dig them out. A dedicated field
  surfaces a "Join" button.
- **Timezone separate from UTC scheduledAt.** UTC is the only sane
  storage format; timezone-as-intent is the only sane recall format.
- **Result doesn't auto-update submission status.** Recruiters
  sometimes mark a round SELECTED then *negotiate*, so the
  submission stays in CLIENT_INTERVIEW until the official outcome.
  We don't want to fight that.
- **Add round defaults `roundOrder = max+1`.** Saves a tedious typing
  step and rarely needs overriding.
