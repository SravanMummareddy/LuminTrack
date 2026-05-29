# 00 — How to use this folder

> **In plain English.** This folder turns the LuminTrack project
> into interview prep. Each concept you used in this app is
> explained in layman + technical terms, paired with where to find
> it in the code, sample interview answers, and "things you should
> NOT say." Use it to (a) ace interviews, and (b) grow as a software
> developer who actually understands what they built.

## Folder map

```
00-how-to-use-this.md          ← you are here
01-concepts/                    ← 30 concept files, layman + technical
02-stories/                     ← 10 STAR-format answer cards
03-system-design/               ← whiteboard pitch for LuminTrack
04-questions/                   ← Q&A banks (behavioral, react/next, backend, etc.)
05-growth-roadmap.md            ← what to learn NEXT
99-cheatsheet.md                ← the night-before recall aid
```

## Reading paths

### "I have an interview tomorrow." (~45 min)

1. `99-cheatsheet.md` — top to bottom. (5 min)
2. Skim `02-stories/01-tough-bug.md` through `10`. Pick the 3 you'll
   tell. (15 min)
3. `04-questions/01-behavioral.md` + the question file matching the
   role (`02-react-and-next.md` for frontend, `03-backend-and-db.md`
   for backend). (20 min)
4. Sleep. (8 hours, non-negotiable.)

### "I want to actually understand this stuff." (~6 weeks)

- One concept file per day from `01-concepts/`. Do the "go deeper"
  reading. After 30 days, you've covered every CS topic this project
  touches.
- One story per week from `02-stories/` — say it aloud to someone
  (or a phone recording).
- After concepts: spend a week on `03-system-design/`. Draw the ERD
  on a whiteboard from memory.
- Then `05-growth-roadmap.md` — pick one item NOT in LuminTrack
  (e.g. Redis, queues, distributed systems) and build a small toy.

### "Mock interview drill." (60 min, weekly)

1. Open `04-questions/` and pick a file.
2. Cover the page with your hand.
3. Ask the question aloud, give yourself 2-3 minutes to answer
   (record yourself if possible).
4. Uncover and read the model answer. Note gaps in your bullet list.
5. Re-answer the same question without looking, focusing on the
   gap.

## How to *use* each concept file

A concept file looks like:

```
# 06 — Transactions and ACID

> In plain English. ...

## The technical core
...

## Where it lives in LuminTrack
...

## How to talk about it
...

## Mistakes to avoid saying
...

## Go deeper
...
```

The order of those sections matters:

- **Plain English first** — read this if you only have 30 seconds.
- **Technical core** — read this when you're learning.
- **Where it lives** — read this before talking about the project.
- **How to talk about it** — read this *and adapt it*. Memorising
  prose makes you sound rehearsed. The bullets are starting points
  for your own phrasing.
- **Mistakes to avoid** — read this *every time*. These are
  confidence-killers that recruiters and engineers notice.
- **Go deeper** — read this to grow beyond the project.

## How to *use* each story file

The stories follow STAR (Situation, Task, Action, Result). They
correspond to real things that happened on LuminTrack — bugs you
fixed, decisions you made, polish rounds you led. Don't memorize
them word-for-word. Memorize:

- The hook ("I had a hydration mismatch on the /submissions page...")
- The decision point (what you considered, what you chose, why)
- The result (one measurable outcome)

Then deliver it in your own voice. Use the "variant phrasings"
section to re-tell the same story for different prompts.

## How to handle "I don't know"

The interviewer asks something you don't know. **Do not bluff.** Try
in order:

1. Ask a clarifying question. ("Do you mean X or Y?")
2. Reason from first principles aloud. ("I haven't used X, but
   given Y in this project, I'd guess...")
3. Connect to something you *do* know. ("That's like the Z problem
   I hit in LuminTrack, where...")
4. If still stuck: "I don't know, but here's how I'd find out:
   read the docs for X, write a small test, ask a senior."

Saying "I don't know but here's how I'd learn" beats saying anything
confidently wrong. Interviewers respect intellectual honesty.

## A note on your level

The plan covers early-career fullstack, backend-leaning, AND
mid-level fullstack perspectives in one set of docs. Each concept
flags which depth is expected at which level:

- **Junior:** know the plain-English summary and where it lives.
- **Mid:** know the trade-offs and the alternatives you considered.
- **Senior:** know how you'd debug it under pressure, scale it, and
  what you'd do differently.

Skim past the senior-level sections if they feel too deep; come
back in a year.

## Honesty disclaimer

Every story and answer in this folder is grounded in *real* code in
LuminTrack. Do not invent details. If you didn't personally make a
decision, say "the team decided" or "I worked on the implementation
of." Interviewers can sniff out fabrications — your real work is
strong enough on its own.
