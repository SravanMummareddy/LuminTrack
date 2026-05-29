# 12 — Timezones and datetime

> **In plain English.** A timestamp on its own is meaningless without
> knowing what timezone it's in. The safe pattern: always store
> UTC in the database, and remember the user's intended timezone
> separately if it matters for display. Never store a "local time"
> without a timezone tag — it'll be wrong six months later.

## The technical core

There are three different things people call "a time":

1. **Instant** — a single point on the universal timeline. UTC.
   `2026-05-27T14:30:00Z`.
2. **Wall time + zone** — "5:30 PM in New York". The instant changes
   with DST.
3. **Local time** (no zone) — "5:30 PM" without context. Useless
   for global apps.

### Postgres types

- `TIMESTAMP WITHOUT TIME ZONE` — a wall time, no zone. Avoid for
  real-world events.
- `TIMESTAMP WITH TIME ZONE` (a.k.a. `timestamptz`) — *stored* as
  UTC. The "with time zone" is a misnomer — it doesn't store a
  zone; it converts to UTC on insert and back to your session zone
  on select. **Use this for events.**
- `DATE` — calendar date only. Use when there's no time component.

### IANA timezones

`America/New_York`, `Asia/Kolkata`, `Europe/London`. These are the
authoritative timezone IDs. Don't use UTC offsets (`-05:00`) for
storage — DST shifts mean the offset changes.

### The DST gotcha

"5:00 PM US Eastern" in summer = `21:00 UTC`. In winter = `22:00
UTC`. If you store the wall-time without the IANA zone, you can't
recover which one was meant.

LuminTrack's solution for interview rounds:

- `scheduledAt: DateTime` → stored as UTC `timestamptz`.
- `scheduledTimezone: String?` → IANA name (`America/New_York`).

The recruiter set both. UTC is the instant; the IANA name records
the *intent* so a Pacific-time scheduler doesn't accidentally
display a London candidate Pacific-local.

## Where it lives in LuminTrack

- `prisma/schema.prisma`:
  - `InterviewRound.scheduledAt DateTime?` → UTC.
  - `InterviewRound.scheduledTimezone String?` → IANA.
- `src/lib/format.ts` → `formatDate`, `formatDateTime`. Today they
  format in the server's locale, not the saved timezone. Display
  using the saved IANA name is a known TODO.
- Audit-row `eventAt` — also UTC, captures when something
  *happened* in the real world (vs `createdAt`, when the row was
  inserted).

## How to talk about it in an interview

**Sample answer (60 sec):**

> "All timestamps in LuminTrack are stored as UTC `timestamptz` —
> that's non-negotiable. The interesting case is interview rounds:
> a recruiter schedules a round and the only sane storage is UTC,
> but I also store an `scheduledTimezone` column with an IANA name
> like `America/New_York`. The reason is DST. If I only stored the
> UTC instant, a recruiter in Pacific time scheduling a London
> candidate at '5 PM London' could end up scheduling them at 5 PM
> Pacific if the converter ran in the wrong zone. The IANA tag
> tells us the *intent* so display can resolve back to the correct
> wall time across DST transitions. There's also an `eventAt`
> column on the audit log — UTC — that records when a real-world
> event happened, distinct from `createdAt` which is when the row
> was logged."

**Expect:**

- "Why IANA and not offset?" → Offsets shift with DST; IANA is
  permanent.
- "What about leap seconds?" → Most systems ignore them; UNIX time
  smears them. Don't bring this up unless asked.
- "How would you display 'X hours ago'?" → `date-fns` /
  `Intl.RelativeTimeFormat` on the user's locale.

## Mistakes to avoid saying

- ❌ "I store local time and convert when needed." Local time
  without a zone tag is unrecoverable.
- ❌ "`TIMESTAMP WITH TIME ZONE` stores the timezone." It doesn't.
  It stores UTC.
- ❌ "JavaScript Date is fine." `Date` is millisecond + UTC, OK for
  instants but its timezone handling is brittle. Use date-fns or
  Temporal.

## Go deeper

- Postgres docs: [Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html).
- The TC39 Temporal proposal — modern JS date/time API.
- "Falsehoods Programmers Believe About Time" (search; canonical
  list).
