# 25 — Focus traps and accessibility (a11y)

> **In plain English.** When a modal dialog is open, a keyboard
> user pressing Tab should *stay inside* the dialog, not wander
> off into the page behind it. That's a focus trap. It's one of
> the small details that separates "looks accessible" from
> "actually usable by everyone." LuminTrack has a reusable hook
> for it.

## The technical core

### What a focus trap does

1. On open, remember the previously-focused element.
2. Move focus into the dialog (first focusable element, or the
   panel itself).
3. While open: intercept Tab + Shift+Tab. If focus is on the last
   element and the user Tabs forward, send them back to the
   first. Same in reverse with Shift+Tab.
4. Listen for Escape; close.
5. Lock body scroll so the page behind doesn't move.
6. On close, restore focus to where it came from.

### Other a11y essentials in dashboard apps

- **`aria-*` attributes for state.**
  - `aria-haspopup`, `aria-expanded` on triggers that open menus.
  - `aria-current="page"` on the active pagination link.
  - `aria-selected` on tab elements.
  - `aria-modal="true"` on dialogs.
- **Semantic HTML first.** A `<button>` is a button, not a `<div
  onClick>`.
- **Keyboard support.** Every interactive element reachable by
  Tab. Custom dropdowns support ↑/↓/Enter/Escape.
- **Visible focus rings.** `focus-visible:ring-2`. *Never*
  `outline: none` without replacing.
- **Color contrast.** WCAG AA = 4.5:1 for normal text, 3:1 for
  large. Tailwind's defaults are mostly fine; verify with a tool.
- **Labels on inputs.** `<label htmlFor>` or `aria-label`.

## Where it lives in LuminTrack

- `src/lib/use-focus-trap.ts` — the reusable hook. Three
  `useEffect`s: capture/restore focus, send focus to first
  focusable, intercept Tab + Escape with body-scroll lock.
- `src/components/ui/dialog.tsx` — uses `useFocusTrap`. Backdrop
  is a `<button>` so screen readers see "close."
- `src/components/layout/mobile-nav.tsx` — also uses
  `useFocusTrap`.
- `src/components/ui/button.tsx` — `buttonClass()` always includes
  `focus-visible:ring-2 focus-visible:ring-indigo-500`.
- `src/components/search/global-search.tsx` — combobox ARIA
  pattern (`aria-haspopup="listbox"`, `aria-expanded`,
  `aria-activedescendant`), ↑/↓/Enter keyboard nav.
- `src/components/ui/pagination.tsx` — `aria-label="Pagination"`,
  `aria-current="page"` on the active link.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Accessibility in LuminTrack starts at the primitives. Every
> button has a visible focus ring; we never strip `outline: none`
> without replacement. The Dialog uses a shared `useFocusTrap`
> hook — on open it remembers the previously-focused element,
> sends focus into the panel, intercepts Tab to keep focus
> inside, listens for Escape to close, and on close restores
> focus to where it came from. Body scroll is locked while open.
> The same hook powers the mobile nav drawer. For the global
> search combobox I followed the ARIA combobox pattern —
> `aria-haspopup="listbox"`, `aria-expanded`,
> `aria-activedescendant` for the highlighted result, with
> ↑/↓/Enter/Escape keyboard handling. It's not exhaustive — I
> haven't done a full screen-reader audit — but the foundations
> are right."

**Expect:**

- "What's the difference between `:focus` and `:focus-visible`?"
  → `:focus-visible` only matches when the browser thinks a focus
  ring is appropriate (typically keyboard, not mouse). Use it for
  rings.
- "How do you test a11y?" → axe-core in dev, keyboard-only nav,
  VoiceOver / NVDA spot-checks.
- "What's WCAG AA vs AAA?" → AA is the practical baseline most
  laws require; AAA is stricter contrast and harder to meet.

## Mistakes to avoid saying

- ❌ "We use semantic HTML so we're accessible." Necessary, not
  sufficient.
- ❌ "ARIA fixes everything." Often the right answer is "use a
  `<button>` instead of a `<div>`."

## Go deeper

- WAI-ARIA Authoring Practices Guide (APG).
- WebAIM contrast checker.
- "No more 'click here' — accessibility for engineers" by
  Marcy Sutton.
