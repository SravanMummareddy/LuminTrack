# Story 06 — The ColumnsMenu refactor

## Question this answers

- "Tell me about a refactor."
- "A time you pushed back on duplication."
- "A time you extracted a component."

## Situation

Three list pages (Jobs, Candidates, Submissions) each had their
own column show/hide + drag-reorder menu. Originally I built it
once for Jobs and copy-pasted to the others. Each was ~110 lines
of dropdown UI + drag handlers + ↑/↓ buttons + checkbox toggle.
Three copies, totaling ~330 lines that had to stay in sync.

When the team asked for keyboard arrows (in addition to drag) for
the iLabor demo on a touchpad-less laptop, I had to make the
same change in three places. That was the trigger.

## Task

Extract a single reusable `ColumnsMenu` without making the column
registry harder to reason about (each list has its own columns,
labels, and visibility defaults).

## Action

1. **Found the boundary.** The duplication was the menu UI + the
   reorder logic. The *column registry* (per-list specific) was
   already in each table file and should stay.
2. **Designed the API.** `ColumnsMenu` takes:
   - `columns: { key, label }[]` — already in current order.
   - `prefs: ColumnPrefs` (visible + order arrays).
   - `onChange(next: ColumnPrefs)` callback.
   - `defaults: ColumnPrefs` for the Reset button.
3. **Walked through the move.** Pulled the menu out of
   `jobs-table.tsx`. Wrote `src/components/ui/columns-menu.tsx`
   with `useState`, the click-outside handler, the drag logic
   (`onDragStart`/`onDragOver`/`onDrop`), and the ↑/↓ buttons.
4. **Wired it back.** Each table's render now passes its column
   list and prefs; ~30 lines removed from each call site, total
   ~80 lines net deletion.
5. **Spotted a subtle bug while doing it.** The previous code
   had a stale `hydrated` gate that briefly disabled the
   "Columns" button while localStorage loaded — confusing. I
   dropped the gate; the menu works correctly with default
   prefs pre-hydration, only the *current visible count*
   reconciles on re-render.

## Result

- One menu component, three consumers.
- The ↑/↓ feature shipped in one file edit, applied everywhere.
- Drag and keyboard both work; sm-and-down hides the grip handle
  (drag isn't practical with touch).
- The handbook documents the pattern.

## Variant phrasings

- **"A time you waited to abstract":** The first two copy-pastes
  were the right call — premature abstraction is worse than
  some duplication. The third trigger justified extraction.
- **"A time you found a bug during a refactor":** The stale
  `hydrated` gate that confusingly disabled the button.
- **"A time you owned a small piece of design":** API design for
  `ColumnsMenu` — keeping the column registry per-table, letting
  the menu be ignorant of LuminTrack-specific concepts.

## Honest caveats

- I follow "rule of three" — duplicate twice, abstract on the
  third. That's a heuristic, not a law. A more careful eye on
  the second copy might have caught the abstraction earlier.
- The component is generic but only used in three places. If a
  fourth never appears, the abstraction was net-neutral. I'm OK
  with that.
