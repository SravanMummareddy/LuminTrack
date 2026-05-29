# Story 09 — Notifications, dark mode, and saying "no"

## Question this answers

- "A time you said no to a feature request."
- "Tell me about prioritising tech debt vs new features."
- "A time you deferred something difficult."

## Situation

Mid-project, two big "nice to have" features were on the
backlog: §G1–G3 (in-app + email notifications) and §I4 (dark
mode). Both kept getting requested. The team's reasoning was
reasonable — recruiters wanted to be paged when a status
changed; engineers wanted dark UI for evening work.

Each was a 1–2 week build *if I dropped everything else*. The
remaining roadmap had: iLabor browser extension (the only piece
of the import flow blocking automation), Reports polish, a
pending security audit, and the demo.

## Task

Decide what to defer, what to ship, and explain it clearly.

## Action

1. **Estimated honestly.** Notifications wasn't "add a bell icon"
   — it was: event channel, fan-out to email + in-app, opt-in
   settings, digest vs realtime, queue infrastructure (we don't
   have one), email provider, deliverability monitoring. 2 weeks
   minimum, probably 3.
2. **Estimated dark mode.** Tailwind v4 supports it, but every
   color in the codebase needs auditing. Charts (Recharts) need
   theming. Badges need second-tone variants. 1 week to do
   thoroughly; 2 days of shoddy.
3. **Compared to backlog cost.** The iLabor extension is the
   *only* piece blocking import automation — everything else is
   built. The Reports polish is small. The demo is fixed-date.
4. **Said no, in writing.** Updated `CLAUDE.md` and
   `ENHANCEMENTS.md` with:
   - "§G1-G3 (notifications) and §I4 (dark mode) are deferred
     indefinitely on user direction."
   - The §J-tier large items (PII export, iLabor extension, 2FA,
     résumé parsing, session inspector) are documented in
     `ENHANCEMENTS.md` rather than being lost in commit history.
5. **Offered a smaller substitute.** Replaced "notifications" in
   the team's mind with the "My work — needs attention" card on
   the Dashboard — a static query of stale submissions and
   waiting rounds. Zero new infra. Solved 80% of the underlying
   need.

## Result

- The extension shipped on time (well, Phase 8b is the last
  piece; Phases 0–8a are in).
- The demo went smoothly.
- "My work" card has lived in regular use and turned out to be
  the *real* answer to most of the notification requests — when
  recruiters check the dashboard at standup, they see what
  needs them.
- Two genuinely valuable features remain documented for a future
  decision.

## Variant phrasings

- **"A time you reframed a problem":** Notifications wasn't the
  ask; *"surface what needs me"* was the ask. The dashboard card
  solves the latter.
- **"A time you protected scope":** Two deferrals, documented in
  the right place, with the rationale visible to future-me and
  the team.
- **"A time you negotiated with a stakeholder":** Offering the
  "My work" alternative made the deferral land easier.

## Honest caveats

- Notifications *is* a real gap. If the team grows to 50, I'd
  prioritize it.
- I should have written the deferral note earlier, in the same
  thread as the original request. Writing it 4 weeks later
  meant I had to explain again.
- Dark mode I genuinely have no plan for. Tracked as deferred
  indefinitely.
