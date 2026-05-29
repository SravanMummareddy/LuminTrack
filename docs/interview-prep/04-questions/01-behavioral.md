# Q 01 — Behavioral

Twelve common behavioral prompts. For each: a short outline, then
a LuminTrack-anchored example. Cross-references go to the
matching `02-stories/*.md` file when one applies.

---

### Q1. "Tell me about a hard bug you debugged."

**Outline.**
- Symptom (specific, reproducible).
- What you tried first (wrong path is OK).
- The "aha."
- The fix + how you knew it was right.
- Lesson.

**Example.** Use story 01 — the hydration-mismatch on the column
count text. See [`02-stories/01-tough-bug.md`](../02-stories/01-tough-bug.md).

**Watch out.** Don't pick a bug that was a typo. Pick one with a
*model* you had to update.

---

### Q2. "Tell me about a time you disagreed with a teammate / manager."

**Outline.**
- The disagreement (what they wanted vs what you wanted).
- How you understood their perspective.
- What you proposed.
- The resolution.

**Example.** Notifications + dark mode deferral — story 09. Frame
as: "the team wanted notifications; I proposed the 'My work'
card as a substitute that met the underlying need without
infrastructure."

**Watch out.** Don't make the other person look bad. Always show
empathy for their position.

---

### Q3. "Tell me about a project you led."

**Outline.**
- Scope (what, why, when).
- Your role (specifically *you*, not "we").
- One technical or coordination decision you owned.
- Outcome.

**Example.** The iLabor importer. Phases 0–8a shipped over weeks.
Drop the technical choice (tolerant envelope adapter + advisory
lock) into the answer.

**Watch out.** "We" is fine for context, but on your contributions
say "I."

---

### Q4. "Tell me about a time you failed."

**Outline.**
- What you tried.
- Why it didn't work.
- What you did about it.
- What you'd do differently.

**Example.** Almost shipping the importer without the advisory
lock — story 10 (near-miss). Or: writing all 30 concept files
without tests, story 09.

**Watch out.** Don't pick a "secretly a strength" failure
("I work too hard"). Pick a real one.

---

### Q5. "Tell me about a time you simplified something."

**Outline.**
- The complexity (specific lines of code, or a process).
- The reframing.
- The simpler version + the metric (lines, files, time).

**Example.** ColumnsMenu extraction — story 06. ~330 lines down
to ~250 net, plus consistent UX.

**Watch out.** Don't conflate "simplified" with "deleted code." A
clearer model is the bigger win.

---

### Q6. "Tell me about a time you delivered fast."

**Outline.**
- The constraint (deadline, scope).
- What you cut / deferred.
- The shipped thing.
- What you didn't get to.

**Example.** Pre-demo polish round — Tier 1 fixes in two days
(focus traps extracted, scope toggle, "My work" card, global
search keyboard nav). Be honest about what was deferred: dark
mode, notifications.

---

### Q7. "Tell me about feedback you received."

**Outline.**
- The feedback (specific).
- Your reaction in the moment.
- What you changed.

**Example.** Either: "the interview history table was a cramped
single table — recruiters said they couldn't see what
happened per job" → re-shaped into grouped-by-job mini-cards. Or:
"the columns Showed-X-of-Y count had a hydration bug nobody
noticed for 2 days" — internal feedback.

---

### Q8. "Tell me about a time you mentored someone."

**Outline.**
- Who, what they were stuck on.
- How you scaffolded vs solved it for them.
- The handover.

**Example.** If you don't have a real one, *do not invent*. Talk
about the docs you wrote (`docs/handbook/`, this folder) as
mentorship-for-future-people including yourself.

**Watch out.** Lying loses. Reframe to truthful adjacent
experience.

---

### Q9. "Tell me about a time you took initiative."

**Outline.**
- The unowned problem.
- Why you noticed.
- What you did without being asked.

**Example.** Spotting the concurrent-import race during handover
writing — story 10. Or: writing `AGENTS.md` to warn future
collaborators about the bleeding-edge stack — story 08.

---

### Q10. "Tell me about a time you said no."

**Outline.**
- The ask.
- Why no.
- How you said it.
- The alternative.

**Example.** Notifications + dark mode — story 09. Documented in
`ENHANCEMENTS.md` so the decision survives.

---

### Q11. "Tell me about a time you wrote documentation."

**Outline.**
- The audience.
- What was missing without it.
- The doc + how it's used.

**Example.** `docs/handbook/` and this interview-prep folder. Or
the `bugs.md` triage summary at the top of the file.

---

### Q12. "What's your biggest weakness?"

**Outline.**
- A real one (not a strength in disguise).
- What you're doing about it.

**Example honest list to choose from:**
- "I don't write tests by default. I'm fighting that habit by
  starting features with a test now even when they're small."
- "I sometimes over-design polymorphic schemas when a single
  table would do — I was lucky LuminTrack's polymorphism is
  actually justified."
- "I tend to defer telemetry. Without it, my next
  prioritisation is a guess."

**Watch out.** "I work too hard" / "I care too much" — never.
