# 24 — Responsive design without writing media queries

> **In plain English.** Make the same UI look good on a phone, a
> laptop, and a giant monitor. Old-school: write CSS media
> queries. New school with Tailwind: prefix utility classes with a
> breakpoint (`md:flex`). LuminTrack's tables are a fun case study
> — below `md` they morph into a stack of cards, at `md+` they're
> a real table, *with the same HTML markup*.

## The technical core

### Tailwind v4 breakpoints (default)

| Prefix | Width   |
|--------|---------|
| `sm`   | 640px+  |
| `md`   | 768px+  |
| `lg`   | 1024px+ |
| `xl`   | 1280px+ |

Mobile-first: no prefix = applies everywhere. `md:flex` = applies
at 768px and up. Override by stacking: `flex md:grid` = flex on
mobile, grid on desktop.

### The "container queries" newer pattern

`@container` lets a component respond to its *parent's* width, not
the viewport. LuminTrack doesn't use this yet; it's worth knowing.

### LuminTrack's responsive-table trick

The trick is one `<table>` whose **descendant variants** flip
layout below `md`:

```tsx
<table className="block w-full text-sm md:table
  [&_thead]:hidden md:[&_thead]:table-header-group
  [&_tbody]:block md:[&_tbody]:table-row-group
  [&_tbody_tr]:block md:[&_tbody_tr]:table-row
  ...">
```

Below md: `display: block` makes the table flow as cards. The
`<Td label="…">` cell renders its column name inline (with the
value next to it). The title cell uses a `cardLink` helper that
draws a stretched `::before` so the whole mobile card is tappable.

At md+: defaults restore — `table-header-group`, `table-row`,
`table-cell`. Everything looks like a normal table.

### Scroll-shadow trick

`src/components/ui/table.tsx` uses a CSS-only "scroll shadow" (Lea
Verou's): two white masks + two inner shadows that reveal
themselves only when the table overflows horizontally. No JS.

## Where it lives in LuminTrack

- `src/components/ui/table.tsx` — the descendant-variant trick and
  the scroll-shadow.
- `src/components/layout/mobile-nav.tsx` — slide-out drawer at
  `<md`, hidden at `md+`.
- `src/components/layout/topbar.tsx` — `hidden sm:block` to hide
  the name+role on tiny screens.
- `src/components/ui/mobile-sort.tsx` — mobile-only sort dropdown
  pairing with `SortableHeader`'s desktop column headers.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Tailwind v4 in LuminTrack means I don't write media queries —
> the breakpoints are utility prefixes. `md:flex` means 'flex at
> 768px and up.' The interesting case is the responsive table.
> Below md, I want a stack of cards; at md+, a normal table. Two
> options: render different markup with `useMediaQuery` and risk
> hydration mismatches, or use one markup and CSS-flip the
> layout. I went with the second. The `<table>` element has
> descendant variants — `[&_thead]:hidden md:[&_thead]:table-header-group`
> — so below md it becomes `display: block` and reads as cards,
> and at md+ the table semantics restore. Each `<Td label="…">`
> renders the column name inline on mobile, which makes the
> cards self-documenting. One HTML tree, no JS-mediated layout
> swap."

**Expect:**

- "What about accessibility?" → The mobile view still uses
  `<table>` semantics so screen readers behave consistently.
- "Container queries vs media queries?" → Container queries
  respond to *parent* width; great for cards inside grids that
  resize differently from the viewport.

## Mistakes to avoid saying

- ❌ "I detect mobile with `useMediaQuery`." That's a Client
  Component runtime check; CSS-only is cheaper and avoids
  hydration jank.
- ❌ "I have a separate mobile codebase." Almost never the right
  call for a dashboard app.

## Go deeper

- Tailwind v4 docs.
- Una Kravets' container-queries write-ups.
- Lea Verou's blog post on the pure-CSS scroll shadow.
