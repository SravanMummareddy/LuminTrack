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

## Phase B — Dynamic RBAC

Migration `20260711160000_rbac_roles_permissions` (Permission/Role/RolePermission + User.roleId).
**Dev-applied + seeded. PROD NOT APPLIED** — coordinate with the code deploy, then run `seedRbac`.
Expand step only — the `UserRole` enum is kept; a later contract migration drops it.

### Refactor (parity — no behavior change)
- [x] `permissions.ts` predicates now shim over `can(viewer, key)`; `{role:x}` literals still work via the enum→template fallback.
- [x] Unit: `permissions.test.ts` (40) unchanged-green + `permission-catalog.test.ts` (8 new) lock the catalog↔template map + the can() bridge.
- [x] Inline authz migrated: placements rate-mask → `canViewFinancials`; user governance → `canGrantManagerRole`.
- [ ] Smoke every tier still sees exactly what it did before (recruiter / team-lead / manager) — nav, financials, VPR, sensitive docs, settings. (browser)

### Seed + hydration
- [x] `seedRbac` idempotent: catalog + 3 system roles (Manager 14 / Team Lead 9 / Recruiter 2) + backfill roleId (0 users unassigned). Wired into `seed-demo.ts`.
- [x] `getCurrentUser` hydrates `permissions` from the assigned role; `saveUser` syncs `roleId` from the enum role.
- [ ] Reseed (`npx tsx prisma/seed-demo.ts`) still succeeds end-to-end with the RBAC step. (needs run)

### Roles admin UI (Settings → Roles)
- [x] Roles tab lists Manager/Team Lead/Recruiter with permission + user counts — verified on dev (14/2, 2/8, 9/2).
- [x] Edit a system role: name locked ("System roles can't be renamed"), permission grid shows correct grants — verified on dev (Team Lead: 9 boxes, no "Analytics/reports").
- [x] Create a custom role ("Sourcer", 2 perms) via real saveRole → appears as Custom in list — verified on dev.
- [ ] Delete guard: custom role with 0 users deletes; system role / role-with-users blocked. (unit logic in action; not browser-exercised)
- [ ] Lock-out guard: unticking "Manage roles" on the last granting role is rejected. (unit logic in action; not browser-exercised)
- [ ] NOTE: a test "Sourcer" role exists on the dev DB — cleared by the next reseed.

### Custom-role assignment (follow-up — DONE)
- [x] User-form Role picker reads from the roles table (system + custom) — verified on dev (lists Manager/Recruiter/Team Lead/**Sourcer**).
- [x] `saveUser` stores `roleId` + derives the enum tier from the role's permissions (`deriveEnumTier`: tier:manager→MANAGER, tier:full→TEAM_LEAD, else RECRUITER) — no `baseRole` column needed. 2 unit tests.
- [x] Users list shows the assigned role **name** (not just the enum tier).
- [ ] Assign a custom role to a real user + confirm the derived enum + role name persist. (browser — picker verified; write path unit-tested)
- [ ] Governance: a non-grant-manager actor can't assign a manager-tier role. (unit logic; not browser-exercised)

## Cross-cutting
- [ ] `npm run build` clean; full unit suite green (currently 212).
- [ ] Coordinated prod deploy: apply migration → promote code in one window; smoke-test login + `/org-chart`.
</content>
</invoke>

## Phase C — multi-tenancy foundation (2026-07-11)

### C1 — schema + migration + backfill
- [x] `Organization` model + `organizationId` on all 25 tenant-data tables (not `Permission`); `User.isPlatformAdmin`; 8 composite uniques; sentinel `@default("")`. Migrations `20260711170000_multi_tenancy` + `..170500_org_default_sentinel` applied to **dev**. **Prod: PENDING (C7).**
- [x] Backfill verified on dev: 1 default org, all 12 users / 50 jobs / 4 roles stamped, Sriman = sole platform admin.

### C2 — enforcement (`scopedPrisma`)
- [x] `orgScopeExtension` (src/server/org-scope.ts) + `scopedPrisma(orgId)` + memoized `getScopedPrisma()`. 8 unit tests (inject/rewrite logic + `canManageOrganizations`).
- [x] Runtime isolation proven (script): create auto-stamps org; cross-org find/findUnique/updateMany/delete all blocked.

### C3 — re-root sweep
- [x] 56 files base `prisma`→scoped `db`; 67 `$transaction` entry points re-rooted; shared helpers retyped to `Tx`. Base `prisma` only at 5 audited escape hatches (health, login + getCurrentUser bootstraps, 2 cron org-listers). "Zero stray prisma." grep passes.
- [x] Cron purge + backup iterate active orgs with `scopedPrisma(org.id)` (no user session).

### C4 — analytics
- [x] No raw SQL; all analytics scoped; "company-wide new vendors" correctly scopes to the tenant.

### C5 — Organizations admin (super-admin only)
- [x] Settings → Organizations tab (list/create/edit), gated 3 ways (hidden tab, `<Forbidden/>` on direct URL, action rejects non-super-admins) — verified in browser as Sriman.
- [x] Create-org provisions the new tenant's 3 system roles; per-org role isolation confirmed (script: new org sees 3, default sees 4).
- [ ] DEFERRED: assigning a user to a *different* org (org-switch / onboarding) — foundation creates users in the acting admin's org.

### C6 — tests + build
- [x] Full unit suite green (**222**, +8). tsc clean. `npm run build` clean.
- [x] Demo seed org-aware + re-run: all rows org-stamped (0 sentinel-empty).
- [x] `tests/integration/tenant-isolation.test.ts` committed (Docker-gated; Docker was down locally — run via `npm run test:db:up`).
- [x] Browser: Organizations tab + full dashboard render under the scoped client, no console errors.

### C7 — prod deploy (PENDING owner go-ahead)
- [ ] Apply both migrations + backfill to prod `DIRECT_URL` FIRST (additive, invisible to live code); verify default org + `isPlatformAdmin` populated; THEN merge code. Smoke: login, dashboard, Settings → Organizations.
