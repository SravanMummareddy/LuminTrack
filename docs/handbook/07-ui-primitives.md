# 07 — UI primitives

> **In plain English.** The reusable building blocks every page is
> made of. Eight files in `src/components/ui/`. Once you know what
> each one does, every screen in the app is "compose these".

## The toolbox

| File                                | What it does                                                         |
|-------------------------------------|----------------------------------------------------------------------|
| `table.tsx`                         | Responsive table: cards <md, real table at md+.                      |
| `button.tsx`                        | `Button` + `LinkButton` + `buttonClass()` helper. 4 variants × 2 sizes. |
| `field.tsx`                         | `Field` (label+error wrapper), `Input`, `Textarea`, `Select`.        |
| `badge.tsx`                         | Pill badge with semantic tones (slate/green/amber/red/blue/indigo).  |
| `dialog.tsx`                        | Modal with focus trap + Escape + outside-click close.                |
| `pagination.tsx`                    | URL-driven page nav with page jump + namespaced param key.           |
| `sortable-header.tsx`               | Table header that toggles `?sort=` / `?dir=`.                        |
| `filter-bar.tsx`                    | Collapsible filter shell with active-count badge + chips.            |
| `columns-menu.tsx`                  | Show/hide + reorder column dropdown for list tables.                 |
| `mobile-sort.tsx`                   | Mobile-only sort dropdown that pairs with SortableHeader.            |
| `page-header.tsx`                   | Standard page title row with subtitle + action slot.                 |
| `forbidden.tsx`                     | Static "403" panel for role-gated pages.                             |

Plus two hooks in `src/lib/`:

| File                       | What it does                                                            |
|----------------------------|-------------------------------------------------------------------------|
| `use-focus-trap.ts`        | Trap Tab inside a panel, close on Esc, restore focus on close.          |
| `use-column-prefs.ts`      | Persist column visibility/order in localStorage with schema versioning. |

## Table — the responsive trick

`src/components/ui/table.tsx`. The whole responsive story is one
`<table>` whose descendant variants flip layout below `md`:

```
<table className="block w-full text-sm md:table
  [&_thead]:hidden md:[&_thead]:table-header-group
  [&_tbody]:block md:[&_tbody]:table-row-group
  [&_tbody_tr]:block md:[&_tbody_tr]:table-row
  ...">
```

Below md it becomes a stack of cards. Each `<Td label="…">` shows the
column name inline. The title cell uses `heading` + a `cardLink`
helper class that draws a stretched `::before` over the whole card so
the entire mobile card is tappable.

Other tricks:
- A pure-CSS **scroll shadow** on the wrapper (Lea Verou's trick) —
  two white masks + two inner shadows that reveal themselves only
  when the table overflows horizontally.
- `Children.toArray(children)` wraps the kids so callers don't have
  to key `<thead>` + `<tbody>` to avoid React's keyless-list warning.

API:
- `<Table>` — the wrapper. Pass thead/tbody as children.
- `<Th>` — header cell. Right-align via class.
- `<Td label="…" heading? secondary?>` — data cell. `label` shows on
  mobile cards; `heading` makes it the prominent cell with chevron;
  `secondary` hides it on mobile.
- `cardLink` / `cardLinkRaise` — utility classes for nested links.

## Pagination

`src/components/ui/pagination.tsx`. URL-driven, no client state for
the page number itself.

Features:
- Prev/Next + numbered pages with "…" gaps when total > 7.
- "Go to page N" input appears when total > 3.
- `paramKey` prop so multiple paginators on the same page don't
  stomp each other (`?subs=2` vs `?ints=3` vs `?page=5`).
- `pageSize` prop so sub-tables (`SUB_PAGE_SIZE = 5`) compute their
  "Showing X–Y of Z" hint correctly.
- `scroll={false}` on every link — clicking page 2 should not jump
  the viewport to the top.

Returns `null` when totalPages ≤ 1.

## FilterBar

`src/components/ui/filter-bar.tsx`. Wraps a `<form method="GET">`
that submits filters as URL params.

Two layers:
- `primary` — fields that are always visible.
- `advanced` — fields tucked behind a "Filters" toggle. Mounted
  always so they submit even when collapsed. The toggle button
  shows the count of active advanced filters as an indigo pill.

Active-filter chips render below the bar. Clicking a chip drops its
keys and resets `page`. The form preserves the current `sort` /
`dir` via hidden inputs so applying a filter doesn't clobber the
sort.

## ColumnsMenu + useColumnPrefs

`src/components/ui/columns-menu.tsx` + `src/lib/use-column-prefs.ts`.

`useColumnPrefs(storageKey, version, defaults)` returns
`[prefs, update, hydrated]`. On the server (and first client render),
returns `defaults`. After mount, re-reads `localStorage` during the
next render and swaps to the stored value. A brief flash is
preferred to a hydration mismatch.

When the stored schema `version` doesn't match (e.g. a column was
added/removed), the stored prefs are discarded and we fall back to
defaults. New columns appear hidden at the end of the order;
removed columns drop out cleanly.

`ColumnsMenu` is the popover UI. Three ways to reorder:
- Drag the grip (mouse).
- ↑ / ↓ buttons next to each row (keyboard or touch).
- "Reset" link goes back to defaults.

Checkbox toggles visibility, preserving canonical order in the
`visible` array.

## Dialog + useFocusTrap

`src/components/ui/dialog.tsx` is a controlled modal:
- `open`, `onClose`, `title`, `description`, `children`.
- Backdrop click closes (it's a `<button>` so screen readers can hit
  it; `tabIndex={-1}` keeps it out of normal tab order).

`useFocusTrap(open, panelRef, onClose)` (in `src/lib/use-focus-trap.ts`):
- On open: remember the previously-focused element, send focus into
  the first focusable inside the panel.
- While open: Tab/Shift+Tab loop inside the panel. Escape calls
  `onClose`. Body scroll is locked.
- On close: restore focus to where it came from.

Shared by `Dialog` and `MobileNav`.

## Button / Field / Badge

Small but everywhere.

- `buttonClass(variant, size)` returns the className. Use it on
  anchors (Next `Link`) so they look like buttons.
- All buttons get a visible `focus-visible` ring — accessibility
  baseline.
- `Field` wraps a control with a label, optional hint, and inline
  error. Hint and error are mutually exclusive (error wins).
- `Input`/`Textarea`/`Select` apply `controlClass` and
  `suppressHydrationWarning` — needed because password-manager
  extensions inject `data-np-*` / `data-lastpass-*` attributes
  before React hydrates.

## SortableHeader + MobileSort

`SortableHeader` renders a clickable `<Th>` that toggles `?sort=key`
and `?dir=asc|desc`. Clicking the active column flips direction;
clicking a different column resets to the column's default direction
(`sortDefaultDir`).

`MobileSort` is a mobile-only dropdown that exposes the same sort
columns (since the desktop headers are hidden on cards). Same URL
params; one source of truth.

## What's deliberately *not* here

- **Combobox / Autocomplete** — global search and the user-mention
  patterns are bespoke. We'd extract if a third use-case appears.
- **Toast / Snackbar** — we have none. Form errors render inline.
  Status updates redirect to a detail page; success is implicit.
- **DataTable abstraction** — the `JobsTable` / `CandidatesTable` /
  `SubmissionsTable` triplet shares enough that *something* could be
  extracted, but each has different sort columns, render functions,
  and column registries. Repetition > the wrong abstraction.

## When you add a new primitive

1. Drop it in `src/components/ui/<name>.tsx`.
2. Default-export the component; named-export any helper classes
   (`cardLink`, `buttonClass`, etc.) other files might need.
3. Add it to the table at the top of this doc.
