# Story 03 — Making dialogs keyboard-usable

## Question this answers

- "Tell me about accessibility work you've done."
- "A time you cared about non-functional requirements."
- "A time you extracted a reusable utility."

## Situation

LuminTrack uses modal dialogs in several places — confirm
deactivate, contact-list editor, add-column menu, mobile nav. The
first version of `Dialog` rendered fine visually but a keyboard
user could Tab right out of it into the page behind. Pressing
Escape did nothing. Opening on mobile didn't lock body scroll, so
the background page scrolled when you swiped.

A teammate testing with VoiceOver also flagged that the close
button wasn't labelled clearly.

## Task

Make the Dialog component genuinely keyboard-accessible without
adding a heavy dependency (Radix would be the easy answer but
overkill for our component set).

## Action

1. **Surveyed what "accessible dialog" means.** WAI-ARIA Authoring
   Practices Guide spells out the pattern: `role="dialog"`,
   `aria-modal="true"`, `aria-label` (or `aria-labelledby`), focus
   trap, Escape to close, restore focus on close.
2. **Wrote the focus-trap logic inline in Dialog first.**
   - On open: capture `document.activeElement`, send focus to the
     panel.
   - Tab/Shift+Tab: loop within the panel's focusable descendants.
   - Escape: call `onClose`.
   - Lock `document.body.style.overflow = "hidden"`.
   - On close: restore captured focus.
3. **Realised MobileNav needed the same.** Refactored into
   `src/lib/use-focus-trap.ts` — a hook taking `(open, panelRef,
   onClose)`.
4. **Added ARIA properly.** Backdrop is a `<button>` (not `<div
   onClick>`) so screen readers see "close." The panel got
   `role="dialog"`, `aria-modal="true"`, `aria-label={title}`.
5. **Tested keyboard-only and VoiceOver** for the contact-edit
   dialog. Tab cycle worked. Escape closed. Focus restored. SR
   announced the title.

## Result

- Both Dialog and MobileNav share `useFocusTrap`. ~90 lines of
  logic, one place to maintain.
- The pattern documented in the handbook
  (`docs/handbook/07-ui-primitives.md`).
- Confidence to add new modal-style surfaces (the upcoming
  contacts dialog) without re-thinking accessibility.

## Variant phrasings

- **"A time you refactored as you went":** I almost shipped the
  focus-trap inline. Realising MobileNav needed the same logic
  was the trigger to extract.
- **"A time you fought scope creep":** I considered adding a full
  set of ARIA primitives (Listbox, Combobox, Menu) — I limited
  the work to what we needed *today*.
- **"A time you learned from a teammate":** The VoiceOver feedback
  came from a colleague; I would not have caught the
  unlabelled-close-button issue on my own.

## Honest caveats

- I haven't done a deep screen-reader audit of the whole app —
  just dialogs.
- The focus trap doesn't handle dynamic children (a focusable
  appearing after open). For our use it's fine; would need
  re-querying for richer dialogs.
