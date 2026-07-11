# Changes to test — running ledger

Durable list of changes that still need verification (dev + prod). Tick items as
tested. Started 2026-07-11 for the platform-evolution build (Phase A onward).

## Phase A — Org chart hardening

Migration: `20260711130000_show_in_org_chart` (adds `User.showInOrgChart BOOLEAN DEFAULT true`).
**Dev-applied. PROD NOT YET APPLIED** — apply in the same window as the code deploy
(2026-07-11 outage lesson: never ship schema-dependent code ahead of its prod migration).

### A.2 — Reporting guardrails (`src/server/actions/users.ts`, `src/server/queries/org-chart.ts`)
- [x] Editing a user to report to their own descendant is rejected with the "creates a loop" error — verified on dev (Deepa → Akhila via real saveUser action; Save blocked, red banner shown).
- [ ] Self-report still rejected (unchanged).
- [ ] A valid skip-level / upward reporting line still saves.
- [x] Unit: `reportsToCreatesCycle` — self / direct / indirect descendant rejected; valid lines allowed (5 tests).

### A.3 — dagre layout (`src/server/queries/org-chart.ts`, dep `@dagrejs/dagre`)
- [x] `/org-chart` renders a tidy top-down tree; wide fan-outs don't overlap — verified on dev (CEO → Sriman → 2 leads → 8 recruiters, clean).
- [ ] Chart still fits-to-view and pans. (browser — renders + fitView confirmed; pan/zoom not explicitly exercised)
- [x] Data: `getOrgChart()` on dev DB → 12 nodes / 11 edges, 0 coincident coords, y-range 0..450 (dagre spread confirmed).
- [x] Unit: `buildOrgLayout` — depth ordering, no coincident coords, cycle-safe, dangling-parent = root (6 tests).

### A.5 — Admin/overseer excluded from chart (`showInOrgChart`)
- [ ] User form has a "Show in org chart" toggle (default on); unchecking hides that user from `/org-chart`.
- [ ] Saving a user with the toggle unchanged does NOT flip the flag (footgun check — toggle must submit its value).
- [ ] Prod: set `sravan` (admin@lumintrack.com) `showInOrgChart=false` so the lone overseer node disappears.
- [x] Query `getOrgChart()` filters `showInOrgChart: true` — verified on dev DB (hiding a user drops the node, then restored).

## Styled dropdown (app-wide) — replaces native `<select>`

New `src/components/ui/select-menu.tsx` (custom listbox + hidden input for forms);
`src/components/ui/field.tsx` re-exports it as `Select` so all ~18 call sites upgrade unchanged.
No schema/migration. No new dep.
- [x] Role dropdown opens a styled popup (indigo highlight + check on selected), selects, updates, closes — verified on dev.
- [ ] Sanity-check a few other forms that use `Select` (Jobs, Submissions, Bench, filters) — open/select/submit still work. (browser)
- [ ] Controlled `Select`s (bench priority/marketingStatus, submission status, settings status filter) — onChange still fires. (browser; tsc clean confirms types)
- [ ] Keyboard: ↑↓/Enter/Esc/Home/End + type-ahead; click-outside closes. (partially exercised)
- [ ] Native `required` no longer enforced client-side on hidden input — Zod server validation still gates required selects (confirm a required select left blank is rejected server-side).

## Cross-cutting
- [ ] `npm run build` clean; full unit suite green (currently 204).
- [ ] Coordinated prod deploy: apply migration → promote code in one window; smoke-test login + `/org-chart`.
</content>
</invoke>
