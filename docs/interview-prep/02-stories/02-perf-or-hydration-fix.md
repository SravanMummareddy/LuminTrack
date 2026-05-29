# Story 02 — The Recharts "width(-1) height(-1)" warning

## Question this answers

- "A time you debugged a third-party library."
- "A performance issue you tracked down."
- "A subtle bug only you noticed."

## Situation

The Dashboard's charts (Jobs by status donut, Submissions by stage
bar) rendered correctly visually, but the dev console spammed:

> Recharts: The width(-1) and height(-1) of chart should be greater
> than 0.

Four lines every time the Dashboard rendered. The chart drew fine
once resized, so it was easy to ignore — but four console warnings
per render is unprofessional and they masked real warnings.

## Task

Eliminate the warnings without disabling Recharts or shipping a
console-noise patch.

## Action

1. **Searched the message.** Found GitHub issues — same `-1, -1`
   reported widely. The pattern: `ResponsiveContainer` measures
   its parent on first render; if the parent is a flex child with
   `min-width: auto` (the default), the browser collapses it to
   `-1`. Recharts logs a warning and waits for the next layout
   pass.
2. **Reproduced.** Stripped the Dashboard to just one chart card.
   Warning still present. Confirmed it's about the *parent's*
   layout, not the chart's data.
3. **Tried fixes in order:**
   - Set explicit `width` and `height` on `ResponsiveContainer` →
     defeats the point of responsive.
   - Set `width="100%" height="100%"` on `ResponsiveContainer`
     → still saw the warning because the parent still measured
     `-1`.
   - Wrapped the chart in an outer div with
     `style={{ width: "100%", height, minWidth: 0 }}` → fixed it.
     The `minWidth: 0` told the flex parent to allow the child to
     shrink below content size, which let it measure properly.
4. **Applied to both chart card components** (`BarChartCard`,
   `DonutChartCard` in `src/components/dashboard/charts.tsx`).
5. **Refreshed.** Console clean. Charts still responsive.

## Result

- Zero recharts warnings.
- Learned the flex `min-width: 0` trick — applicable any time a
  child needs to shrink below its content size inside a flex
  container.
- The fix is two lines per chart; no library swap, no upgrade.

## Variant phrasings

- **"A time you read library source code":** I peeked into
  Recharts' `ResponsiveContainer` to understand the
  ResizeObserver behaviour before guessing at fixes.
- **"A time you reduced noise":** Four warnings per page made
  real warnings invisible. Fixing this restored the signal.
- **"A time you didn't blame the library":** Tempting to say
  "Recharts is buggy." The bug was in *my* parent layout.

## Honest caveats

- Hidden behind shallow CSS understanding — flex `min-width`
  defaults are something I had to look up.
- Could be tested but isn't (visual regression tooling isn't in
  the project).
