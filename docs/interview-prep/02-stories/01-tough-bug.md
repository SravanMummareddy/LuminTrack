# Story 01 — The hydration mismatch bug

## Question this answers

- "Tell me about the hardest bug you've debugged."
- "Walk me through a time you fixed something in production."
- "Describe a time you got stuck and how you got unstuck."

## Situation

I was building LuminTrack's submission list page. The basic table
worked, but I added a column-picker that persisted choices to
`localStorage`. The next day the dev console started shouting
"hydration mismatch" specifically on the line "Showing 9 of 10
columns." Refresh sometimes showed 10/10, sometimes 9/10 — clearly
state-dependent.

## Task

Find the root cause and fix it without:

- Just removing the count text (lazy).
- Adding `useEffect` and rendering nothing until mount (caused a
  layout shift, ugly UX).
- Sprinkling `suppressHydrationWarning` everywhere (hides bugs).

## Action

1. **Reproduced reliably.** Cleared localStorage, refreshed — saw
   "10 of 10." Toggled a column off, refreshed — "9 of 10." Cleared
   again — back to "10."
2. **Traced the mismatch.** The server renders without knowing
   localStorage, so it produces "10 of 10" (defaults). The client
   hydrates with the stored prefs (9 visible). React sees the
   text differ.
3. **Considered three fixes:**
   - `useEffect` mount gate → layout shift, bad UX.
   - `suppressHydrationWarning` on the `<p>` → hides the warning
     but the values still diverge, harmless here because the
     correct value renders right after.
   - Restructure `useColumnPrefs` so the *first* client render
     also returns defaults, then a follow-up render swaps to
     stored prefs.
4. **Picked the third option.** Used React's "adjust state during
   render" pattern — server returns defaults; first client render
   returns defaults (still no localStorage read); during the same
   render, set a flag, read localStorage, swap to stored prefs;
   second render uses them. Plus `suppressHydrationWarning` on
   the count text as a belt-and-braces because the brief flash
   is intentional.
5. **Documented why.** Added a comment in `use-column-prefs.ts`:
   "A brief flash is preferred to a hydration mismatch error."

## Result

- Console clean.
- No layout shift.
- The pattern reused for two other tables (Jobs, Candidates) and
  for the recently-viewed dropdown.
- I learned the hard rule: SSR and the first client render must
  produce byte-identical output, or hydration will fail. Any
  state that doesn't exist on the server (`localStorage`, `Date.now`,
  `Math.random`) needs explicit handling at that seam.

## Variant phrasings

- **"A time you disagreed with the easy fix":** I disagreed with
  the `useEffect` mount gate; the easy fix would have shipped a
  layout shift. I pushed for the render-then-hydrate pattern
  because it preserves first-paint quality.
- **"A time you wrote about your work":** I left a comment in
  `use-column-prefs.ts` explaining the trade-off, so future-me
  (and a teammate) wouldn't undo it.
- **"A time you simplified":** Originally I considered a separate
  `<ClientOnly>` wrapper; collapsing the same logic into the
  hook made every consumer simpler.

## Honest caveats

- I didn't write a regression test. Should have.
- The `suppressHydrationWarning` is intentional but reviewers
  should *see* the comment before approving it again elsewhere.
- The pattern uses React's "adjust state during render" which is
  considered advanced — explain it explicitly if asked.
