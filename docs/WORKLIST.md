# LuminTrack — Master Worklist  *(living doc — the one place to work from)*

Single source for **what we're building, what's broken, and what we're waiting on the owner to
decide.** Consolidates the 2026-07 owner feedback, still-open bugs, and still-live enhancements.

**This replaces** the interim `OWNER_FEEDBACK_2026-07.md` + `ROADMAP_2026-07.md`.
**Archives (history/reference, not worked from here):** [`bugs.md`](../bugs.md) ·
[`ENHANCEMENTS.md`](../ENHANCEMENTS.md) · [`docs/DEVLOG.md`](./DEVLOG.md) ·
[`docs/PROJECT_REQUIREMENTS.md`](./PROJECT_REQUIREMENTS.md) ·
[`docs/OWNER_QUESTIONS_excel-mapping.md`](./OWNER_QUESTIONS_excel-mapping.md).

**Status:** 🔴 blocked (owner decision) · 🟡 ready to build · 🟢 in progress · ✅ done · 🅿️ parked · ⚫ dead
**Size:** S <1d · M 1–3d · L 3–5d · XL multi-week · 🎨 = UI/UX win

---

## ⤵ RECONCILED 2026-07-13 — read this first (the wave tables below lag reality)

The dated wave tables in §B were **not** kept current as PRs merged. Authoritative "what shipped" is
CLAUDE.md + `docs/DEVLOG.md`. As of `main` today, essentially the whole feature roadmap is **done**:

- **Waves 1a/1b/2/3** ✅ (access foundation, org+reporting model + org chart, quick wins, the **6-form
  forms-discipline rollout** #86/#90/#92/#93/#94/#95/#96 + field-definition cleanup #102).
- **Wave 4 — submission pipeline** ✅ #97 (strict transitions SB-6, per-stage dates SB-4, per-status
  required round fields SB-5, round-tracking IV-2, min-subs nudge V-6, NO_SHOW/CANCELLED) + **IV-1**
  interview schedule view ✅.
- **Wave 5** — **V-5** received-date + time-to-submit ✅ #99/#100 · **SRC-2** source analytics ✅ #101 ·
  **SRC-1** partly done (job source rework in #86) · **SRC-3** still 🅿️ (gated on D9).
- **Wave 6 — C-1** original-résumé flag ✅.
- **Wave 7 family** ✅ — NT-0/2/3 notifications + digest #103 · **7.1** team-lead→recruiter VPR-assignment
  email #104 · **7.2a/b** unified pending-todos + team-lead/manager dashboard #105/#106 · digest cron
  **7am CST** #107 · phantom-todo fix #108.
- **D13** rate masking ⚫ DECLINED.

**What's actually left:**
- **Owner-decision-gated:** D5 (referrer entity → SRC-1 finish) · D9 (new-vendor/closure def → SRC-3) ·
  D14 (VPR-dedup scope) · D8 (hosting → **Track B**: Google SSO HAND-3, GoDaddy subdomain HAND-2).
- **Enhancements (post-pilot):** candidate/vendor **outreach** (🅿️ parked by owner 2026-07-13, revisit
  after bug-cleanup) · inbound/two-way email · Resend SDK + React Email · org-switch/multi-org onboarding
  · encrypted off-site backup HAND-4.
- **Verification:** a logged-in **browser pass** over the new dashboard (built + data-layer-smoked, not
  UI-clicked) + the email-prefs toggle.
- **Bug backlog: CLEAR** — `bugs.md` reconciled 2026-07-13 (all its open items were already shipped); an
  adversarial app-wide sweep found the server layer clean; the one real defect (phantom terminal-round
  todos) was fixed #108.

---

## A. Decisions needed (these block real work)

| # | Decision | Blocks | Status |
|---|---|---|---|
| **D1** (Q1/Q2) | Roles + org hierarchy | Wave 1 | ✅ **Admin = Manager tier, NO 4th role** (3 tiers). Org: CEO→Mgrs+Admin→Teams(TL+members); use an org-chart **library**, model reporting links. |
| **D2** (Q9) | Submission stages + per-stage fields | Wave 4 | ✅ 7-stage list stands; **never skip** — record "didn't happen/N-A"; per-stage fields mirror the Interview-details tab (decide while building). |
| **D3** (Q8) | "Received date" + time-to-submit metric | Wave 5 | ✅ SHIPPED #99/#100 — recruiter-entered received date on the Job (backdatable) + time-to-first-submission metric + avg tile on Reports |
| **D4** (Q7) | Min-submissions rule | V-6 | ✅ **per requirement**, soft nudge |
| **D5** (Q11) | Referrer = Contacts reuse vs new entity | SRC-1 | 🔴 still open |
| **D6** (Q12) | Email provider + triggers | Wave 7 | ✅ **Resend**; digest (weekday **7am CST**) + submission→TL event + opt-out + **7.1** team-lead→recruiter VPR-assignment email all shipped |
| **D7** (Q3/Q4/Q5/Q6/Q10) | Dashboards · Settings moves · "unknown" fields · clientRate · interview view | Waves 1–4 | ✅ Q5 (forms mandatory+N-A) · Q6 (clientRate N-A) · **Q3 dashboards** (task/team/org split, 7.2) · **Q10 interview view** (IV-1 schedule) all shipped. Q4 (Settings reorg) — minor, open. |
| **D8** (HAND-1) | Hosting model + Supabase-vs-Neon | Track B | 🅿️ **deferred** — features/bugs first, discuss later |
| **D9** | "New vendors" & "Closures" definitions | Scorecard + SRC-2 | 🅿️ **deferred** — owner low-clarity too; later wiring fix |
| **D10** | 6-tab Bench-Sales module | Bench scope | ✅ **dropped** — current Bench tab is enough |
| **D11** | Expired Work-Auth policy | Submission gate | ✅ **soft-warn + flag, but allow** |
| **D12** | Field cleanup — which fields | Wave 3 | 🟡 owner decides **from the field audit** (new Wave-3 task) |
| **D13** (new) | **Per-record rate masking** for the restricted tier | Wave 1a rate follow-up | ✅ DECLINED (2026-07-12) — owner: "don't mask, skip it." Recruiters keep full rate visibility. The `financials:view` permission still exists (recruiters lack it, TL/managers have it) so masking can be flipped on per-user in Settings → Roles later if wanted. No build. |
| **D14** (new) | **Submission-dedup scope — VPR-level vs job-level** | Submit picker + duplicate gate | 🔴 open — today a candidate is deduped per **(candidate, job)**: submitting/blocking is keyed to the underlying Job, not the VPR. But a job can carry **multiple VPRs** (e.g. the same job owned by different managers), so a candidate submitted via one VPR is "already submitted" for **all** VPRs on that job. Questions for owner: (a) should a candidate submitted via one VPR still be submittable via another VPR on the **same** job? (b) if yes, does dedup become **per-VPR** instead of per-job (risking two live submissions of the same person to one job)? **Keep as-is for now (job-level) — do not change.** _(Partial fix already shipped 2026-07-11: REJECTED prior submissions no longer block re-submit in the picker.)_ |

---

## B. Execution plan (priority order — work DOWN the waves)

> Rationale: dependencies first → cheap high-visibility wins → big builds → infra last.

### Wave 1a — Access foundation (roles · nav · dashboard split · quick-add)  ✅ **BUILT (branch `wave1a-access-foundation`)**
| ID | Item | Size | Status |
|---|---|---|---|
| A-1/A-2 | Restrict nav by tier (Recruiter+TL: 7 operational items only; Mgr: +Dashboard·Reports·Recruiters·Settings) | M | ✅ new `isManagerTier` predicate; nav filtered; `/reports`+`/recruiters`(+`[id]`) now guarded; `/settings`+`/audit`+`/export` → Manager-only; `settings` collapses to My-account tab for restricted tier |
| S-1 🎨 | Split dashboards: Recruiter/TL **task view** vs Mgr **analytics** | L | ✅ reused the existing `?scope=me\|org` seam — non-managers locked to `scope=me` "My Work"; toggle hidden; org scorecard auto-hidden |
| A-3/S-2 | Clients/Vendors: quick-add for recruiters/TL, admin curates | M | ✅ new `canQuickAddOrgEntities` (any signed-in) on the job-form create path; `canManageOrgEntities`/`canManageUsers` → Manager-only |
| — | Verified | — | ✅ tsc clean · 193 tests (was 178) · browser-verified recruiter/manager/**team-lead** tiers + quick-add affordance |

**Deferred out of 1a (flagged):** per-record **rate-field masking** (VPR/submission/job/placement rate
columns still visible to the restricted tier) — blocked on a new owner decision, **D13** below.

### Wave 1b — Org / reporting model + org chart (the heavy half)  ✅ **MERGED (PR #79, `0aaa3ef`)**
| ID | Item | Size | Status |
|---|---|---|---|
| S-3 | Real `Team` + `User.reportsToId` chain replacing free-text `teamLabel` | L | ✅ migration `20260711120000_org_reporting_model` (backfill teams/leads/chain, drop teamLabel) — **applied to dev + PROD (2026-07-11)**; prod backfill verified (2 teams; Sriman apex — no CEO on prod, seed-only) |
| S-3 | Rewire scorecard/team-lead consumers to the relation | M | ✅ `deriveTeamLead` via team.lead; scorecard groups by `teamId`/`teamName`; `listTeams()` |
| S-3 | Team-assignment admin UI | M | ✅ Settings **Teams** tab (create/rename/set-lead) + Team/Reports-to pickers on the user form (server default reportsTo=team.lead) |
| S-3 🎨 | Org chart | M | ✅ **React Flow v12** (`@xyflow/react`), server-side layout (no dagre), Manager-only `/org-chart` in Insights; CEO apex = real Manager-tier login (seeded `ceo@lumintrack.com`) |
| — | Verified | — | ✅ tsc clean · 199 tests (+6 org-tree) · browser-verified chart (CEO→mgr→TLs→recruiters), Teams tab, scorecard-by-team, recruiter→Forbidden. Seed reseeded (12 users incl. CEO) |

### Wave 2 — Quick wins & UX cleanup  🎨 *(no owner input needed — start anytime)*
| ID | Item | Size | Status |
|---|---|---|---|
| BUG-1 | "Submit via requirement" intermittently dead (works after reload) — root-cause stale client state | S | ✅ merged #77 |
| N-1 🎨 | All display IDs clickable → detail view (submission ID in candidate view is dead) | S | ✅ merged #77 |
| N-2 | Remove the manual ID-entry path (IDs auto-only) | S | ⚫ **no-op** — investigated, no manual LuminTrack-ID path exists (display IDs all auto `seq`). Only manual "ID" is the job's optional *"Customer ref"* (client's own req #) — legitimate. Confirm w/ owner. |
| N-3 🎨 | Context-aware "Back" (Interviews→candidate→back returns to Interviews) | S–M | ✅ merged #77 — `BackLink` on all 5 detail pages; **browser-verified** |
| N-5 | Same ID/nav treatment on Placements | S | ✅ — IDs already clickable; back-nav now via BackLink |
| V-1 🎨 | Replace raw job `<select>` with searchable/scrollable picker | S–M | ✅ merged #77 |
| UX-1 🎨 | `table-layout: fixed` + preset widths | S | 🅿️ **deferred** — acute symptom already fixed (whitespace-nowrap, 2026-07-08); global `table-layout:fixed` is risky, not a quick win → stays the ENHANCEMENTS resizable-columns item |
| BUG-2 | Global search index display IDs (CAND-/JOB-/REQ-) | S | ✅ **already done** — search.ts parses CAND-/JOB- seq. (VPR/SUB/PLC not in the search set — separate feature) |
| BUG-3 🎨 | Scorecard overflows right edge @1440px → horizontal-scroll affordance | S | ✅ **already fixed** — scorecard-grid has `overflow-x-auto` + sticky first col |
| BUG-4 🎨 | Mobile topbar search overlaps avatar on narrow tablets | S | ✅ **already fixed** — topbar: capped search + spacer + `shrink-0` cluster |

### Wave 3 — Forms discipline (one pattern, three surfaces)  🟢 mostly done via PR #86
> **Job form redesign SHIPPED in PR #86** (branch `feat/job-form-redesign`, awaiting owner merge; both
> migrations applied to dev+PROD). Delivered the N/A pattern + field cleanup + smart dates on the Job
> form, plus a big adjacent chunk: **source rework** (Job board/Referral/Sister/Other, Direct removed) +
> a **Referrer directory**, **org-entity display IDs + manager-only detail pages + slim lists +
> created/updated-by + app-wide OrgEntityLink**. See DEVLOG 2026-07-12 + plan RESUME-HERE.

| ID | Item | Size | Status |
|---|---|---|---|
| J-1/V-2/SB-1 | Required-by-default + explicit **"N-A"** toggle (no blanks) | M pattern + S/surface | ✅ **Job form** (NullableField); other forms reuse the pattern next |
| V-2/SB-2 | Prefill Submission from Job/requirement | S–M | ✅ submission prefill live; VPR-rate-from-job small follow-up |
| V-3 | Both VPR creation paths enforce completeness | S | ✅ VPR form redesign (#90) applied the N-A pattern |
| V-4 | Show created/updated-by + timestamps on the VPR | S | ✅ (2026-07-11) |
| SB-3 | Résumé upload required to advance a submission | S | ✅ (2026-07-11) |
| J-1b | Field cleanup — remove unnecessary job fields | S | ✅ removed reqType/department/atsId/durationLabel (#86) |

### Wave 4 — Submission pipeline rework  ✅ **SHIPPED #97 + IV-1**
| ID | Item | Size | Status |
|---|---|---|---|
| SB-4 🎨 | Per-stage **dates** on the pipeline timeline (when, not just where) | M | ✅ #97 (derived from status log) |
| SB-5 | Per-status required forms (e.g. Vendor Screen→Interview: interviewer, mode, support, date) | L | ✅ #97 (hard-required round fields + advance gate) |
| SB-6 | Controlled transitions: no free jumps, skippable-with-reason stages | M | ✅ #97 (advanceBlock; one-step-back needs a reason) |
| IV-2 | Round tracking: final vs another round + that round's details | S–M | ✅ #97 (NEED_ANOTHER_ROUND + NO_SHOW/CANCELLED) |
| IV-1 🎨 | Interview schedule view + visual done-vs-pending styling | M | ✅ /interviews?view=schedule |
| V-6 | Min-submissions warning (<2 → nudge) | S | ✅ #97 (soft per-requirement nudge) |

### Wave 5 — Tracking & analytics  🟢 V-5+SRC-2 shipped · SRC-1/3 gated (D5/D9)
| ID | Item | Size | Status |
|---|---|---|---|
| V-5 | Received-date vs logged-date → correct time-to-submit metric | M | ✅ #99/#100 |
| SRC-1 | Per-job source/lead attribution (channel, referrer+contact, job type) | M | 🟢 partial — job source rework #86; referrer-entity finish gated on **D5** |
| SRC-2 | Source analytics (which channels → which jobs → spend decisions) + per-source conversion column | M | ✅ #101 (by source + by job board, fill-rate) |
| SRC-3 | Richer vendor tracking (ties to "New vendors" def, D9) | S–M | 🅿️ gated on **D9** |

### Wave 6 — Candidate & résumé
| ID | Item | Size | Status |
|---|---|---|---|
| C-1 | "Original" (authentic) résumé required at creation, flagged distinct from marketing résumés | S–M | ✅ ResumeKind ORIGINAL/MARKETING + soft gate |

### Wave 7 — Notifications & email  ✅D6 · biggest new lift
| ID | Item | Size | Status |
|---|---|---|---|
| NT-0 | Email infra: Resend (`fetch`, no SDK) + `sendEmail()` (fails safe) + HTML templates | L | ✅ |
| NT-1 | Email on VPR assignment to a recruiter | S–M | ✅ **Wave 7.1** — turned out the prereq existed (`VendorRequirement.recruiterId` is a real User FK). TL "Email recruiter" button (optional note) + assign-form checkbox + `REQUIREMENT_RECRUITER_EMAILED` audit. Explicit sends ignore the `notifyEvents` opt-out. (Candidate-assignment email N/A — candidates aren't recruiter-assigned.) |
| NT-2 | Vercel Cron digest of per-recruiter action items (weekday 7am CST*, reuses "Needs attention" logic) | M | ✅ |
| NT-3 | Triggers: <2 submissions, doc/visa expiry, upcoming interview, missing résumé (all in the digest) + submission→team-lead immediate event | S each | ✅ |

> \* Vercel Cron is **UTC-only** (no DST). Set to **7am CST** = `0 13 * * 1-5` (13:00 UTC = 7am at
> UTC−6). Caveat: during US daylight-saving (CDT, UTC−5) this fires at **8am local** — Vercel can't
> follow DST. Re-pin if that matters.

### Track B — Hosting, domain & handover *(parallel; mostly decisions + infra)*
| ID | Item | Size | Status |
|---|---|---|---|
| HAND-1 | Pick hosting model + Supabase-vs-Neon | decision | 🔴D8 |
| HAND-2 | Point owner's GoDaddy subdomain at the app (landing pages untouched) | S | 🟡 |
| HAND-3 | Google SSO — thin OAuth lib on current auth, or free via Supabase Auth if we move | M | 🔴 |
| HAND-4 | Encrypted off-site backup → owner's Google Drive (was ENHANCEMENTS R4.4) | M–L | 🟡 |
| HAND-5 | Cost sheet for owner (verified ~$30–45/mo; $20 = per-dev-seat, recruiters free) | S | ✅ |

---

## C. Item detail (the nuance behind the one-liners)

Only items whose one-liner isn't self-explanatory:

- **S-1 dashboards** — Recruiter/TL open-screen: # submissions owed, candidates they're on,
  time-sensitive (payments due/receivable, deadlines), a "what's happening to me" list. TL also
  sees their team's activity. Much of this = today's "Needs attention" panel re-scoped to *me*.
- **V-5 received-date (owner's "biggest doubt")** — jobs arrive by email/referral days before
  they're logged, and résumés may be submitted before the job exists in the system. So `createdAt`
  ≠ when work started. Add a recruiter-entered "received date"; measure time-to-submit from it.
- **SB-5/SB-6 pipeline** — each stage transition captures required fields; can't jump stages, but
  some are skippable with an explicit "N/A" reason (e.g. direct interview skips vendor screen).
  **Lock the canonical stage list (D2) before building.** Observed stages: Submitted → Résumé →
  Vendor Screen → Interview → Follow-up → Offer Accepted → Joined (more granular than the spec).
- **C-1 résumé** — reuses the existing multi-résumé feature; add an "Original vs Marketing" flag +
  require ≥1 "Original" on create.
- **A-3/S-2 quick-add** — recruiters/TL can *add* a client/vendor/source inline while working, but
  not *manage* (edit/delete) them; admin curates. Not a free-for-all.
- **Forms "unknown" pattern** — required-by-default; where the recruiter genuinely lacks a value,
  an explicit "Don't know / Not mentioned / N-A" choice instead of a blank. Non-dropdown fields
  (rates/dates) need an equivalent (a "not disclosed" checkbox) — see D7.

---

## D. Decisions made *(log as we lock them)*

- **2026-07-13 — Wave 7 notifications (D6 locked):** provider = **Resend**; **defer NT-1**
  assignment emails (no real assign-to-user action exists yet); digest cadence = **weekday
  mornings ~8am** (UTC — adjust for TZ); **per-user opt-out** = two toggles (`notifyDigest`,
  `notifyEvents`) in Settings › My account. Shipped: digest cron + submission→team-lead event.
- **2026-07-11 — Owner answered the decision sheet** (`docs/OWNER_DECISIONS.md`):
  - **D1/Q2 roles:** "Admin" = **same access tier as Manager**, just a different job title → **no
    4th role**. Keep 3 permission tiers (full = Manager/Admin; restricted = TL + Recruiter).
  - **Org (S-3):** CEO → multiple Managers + Admin; under Manager/departments → Teams (Team Lead +
    members). **Use a well-known org-chart library** rather than building from scratch; customize
    later. → model reporting links + adopt a lib for the chart UI.
  - **D2 stages:** the 7-stage list stands; **nothing is truly skipped** — if a stage didn't happen
    (no vendor screen, or no interview) you **record it as "didn't happen / N-A", not skip it**
    (= SB-6). Per-stage required fields: decide during build by mirroring the existing Interview-
    details tab.
  - **D4:** min-2-submissions counts **per requirement** (ideally 1 req per job), soft nudge.
  - **D9 (New vendors / Closures):** owner has low clarity too — **don't assume; defer** (it's a
    later "wiring" fix, not blocking).
  - **D10 Bench:** **current Bench tab is enough** → the 6-tab Bench-Sales module is **dropped**.
  - **D11 expired work-auth:** **soft-warn + flag, but allow** submission.
  - **Q5 forms:** apply mandatory + "unknown/N-A" to **all** forms; owner will mark which fields are
    hard-required vs N-A-allowed **from a field audit** (see new task below). **Q6:** clientRate
    "not disclosed" = yes.
  - **D6 email:** **all** triggers wanted (assignment, low-submissions, expiry, upcoming interview)
    **+ team-lead-assigned-a-VPR** notification.
  - **D8 hosting:** **defer** — focus on features/bugs now; owner will discuss env/domain/SSO later.
  - **New task — field audit:** for **every tab/form/list**, enumerate fields + analyze
    add/remove/required-vs-N-A; owner decides from that (covers D12 + Q5). → add to Wave 3.
  - **Q10 interviews:** owner asked for a **recommendation** (own ID+detail page vs inline).
- **2026-07-10** — Cost/hosting facts verified: Vercel Pro $20 is **per developer seat**, not per
  app user; recruiters are free visitors. Run-rate ~$30–45/mo. Supabase Pro ($25 all-in:
  Postgres+storage+Google SSO) is the value play *only if* adopting for DB+storage; SSO alone
  doesn't justify it (roll own Google OAuth with a thin lib on the existing session auth).

---

## E. Parked (revisit on demand — not this round)

§J1 PII export / right-to-be-forgotten · §J3 admin 2FA (TOTP) · §J4 session inspector · §E1
résumé parsing (XL) · full drag-to-resize columns · auto-close placements past `endDate` · warn
when ending one placement with another active · granular IAM (partly subsumed by Wave 1 roles).

## F. Dead (do NOT pick)

iLabor **browser extension** · all **iLabor re-import follow-ups** (c2crate unit, title-drift,
questionStatus, re-import race) — iLabor removed 2026-07-10. Old "§G1-G3 deferred indefinitely"
is **reactivated** as Wave 7.

---

## Open loose ends (carry across sessions — updated 2026-07-11)

**Done + live:** Wave 1a (#78) + Wave 1b (#79) merged AND **live on prod** (`0aaa3ef`, org-model
migration applied, backfill verified, 0 runtime errors). No pending prod migrations.

**⚠️ Needs testing (not yet verified):**
- **Prod Wave 1b end-to-end login click-through** — I can't log into prod (password rule). Owner must
  log in and confirm the pages that were 500ing now load: **Dashboard · Org chart (Insights) · Reports →
  Monthly Performance**, plus Settings→Teams + a Team/Reports-to assignment. Everything except this
  live-login step is verified (dev browser-tested; prod migration + backfill + deploy confirmed).

**Uncommitted / unpushed:**
- Local `main` has commit **`dfe41fb`** (DEVLOG outage entry) — **committed but NOT pushed**. Safe to
  push anytime (prod already on Wave 1b).
- Planning docs remain untracked by design: `docs/WORKLIST.md`, `docs/OWNER_DECISIONS.md`,
  `docs/OWNER_QUESTIONS_excel-mapping.md`, `PRODUCT_OVERVIEW.md`, `DEMO_RUNBOOK.md`.

**Process rules now in force (memory-backed):**
- Mock up UI/UX changes first, get sign-off before coding ([[feedback_ui_mockups_first]]).
- Never merge a schema-dependent PR to auto-deploying `main` with its prod migration deferred — apply
  the migration in the same window (see DEVLOG 2026-07-11 outage).

## Next moves — PLATFORM EVOLUTION roadmap (approved 2026-07-11)

Vision: pilot → scales to more teams → separate companies (SaaS). Don't hardcode; tenancy-ready.
Plan: `~/.claude/plans/ancient-meandering-sparrow.md` · vision: [[project_platform_scale_vision]] ·
org edge cases: `docs/ORG_CHART_EDGE_CASES.md`. RBAC seam ≈ 1 file (`permissions.ts`).

1. **Phase A — Org chart hardening** (NOW; smallest; fixes the live prod breakage).
   (a) ✅ **DONE — prod data repaired** (2026-07-11): Sriman=apex, admin `sravan`/admin@lumintrack.com
   detached (reportsTo/team null), cycle broken. sravan now shows as a lone 2nd root until (e) hides it.
   (b) Guardrails in `saveUser` + reports-to picker (reject cycles, prevent orphan/multi-apex, sync
   reportsTo↔team). (c) **dagre** layout in `buildOrgLayout`. (d) optional `User.title`.
   (e) **NEW — admin/overseer excluded from org chart:** owner clarified an **Admin = superuser who
   oversees everything but sits OUTSIDE the org hierarchy / hidden from the chart**. Add an exclude
   mechanism (e.g. `User.showInOrgChart` default true, or derive from an admin role in Phase B) + a
   toggle on the user form; org-chart query filters it. **This updates D1** ("Admin = Manager tier, no
   4th role") → with dynamic RBAC, Admin is a distinct role (all-permissions + not-in-chart).
2. **Phase B — Dynamic RBAC** (NOW after A): `Permission`/`Role`/`RolePermission` tables + ~40-key
   catalog + `can(viewer,key,scope)` (named predicates become shims) + hydrate in `getCurrentUser` +
   migrate ~12–15 inline checks + **Settings→Roles admin UI (mock first)** + seed default roles +
   backfill + rewrite tests. Expand-contract migration.
3. **Phase C — Multi-tenancy** (LATER, own session): `organizationId` + central `scopedPrisma` layer.
4. **Phase D — later/optional:** dotted-line matrix reporting · policy engine · Postgres RLS.

**Also still open (not dropped):** D13 (rate-masking pay-vs-bill) · Wave 3 field-audit (forms) · Waves
4–7 · Track B hosting. These slot in around the platform work.
