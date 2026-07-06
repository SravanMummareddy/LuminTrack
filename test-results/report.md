# LuminTrack — Demo-Readiness Review

**Date:** 2026-07-06 · **Branch:** `feature/feedback-round-1` · **Reviewer:** QA lead / product review pass
**Method:** Freshly reseeded test DB (50 jobs · 30 candidates · 14 VPRs · 160 submissions · 9 placements · 81 interview rounds). Playwright walkthroughs as **Admin/Team-Lead** (`sriman@lumintrack.com`) and **Recruiter** (`hrishikesh@lumintrack.com`) across 40+ pages, plus three code-analysis audits (requirements coverage, redundancy, RBAC) and live end-to-end verification. Screenshots in `test-results/screenshots/`; raw walk log in `test-results/walk-log.json`; bug log in `test-results/bugs.json`; supporting audits in `test-results/{coverage-matrix,redundancy,rbac}.md`.

---

## 1. Demo-Readiness Verdict — **GO WITH CAVEATS** 🟡

The app is **stable and demo-worthy**. Across 40+ page loads under two roles I saw **zero console errors and zero network failures**; **RBAC is enforced server-side with zero privilege leaks**; hydration works; the redesigned status-advance flow works end-to-end (click "Advance" → success toast → no crash); the new private-Blob résumé/document upload streams correctly (`200 application/pdf gzip`); and the headline numbers reconcile to the seed (160 submissions, 81 interview rounds, 9 joined). **No critical or blocking bugs.** The caveats are three demo-narrative risks, not stability risks: (1) the **Monthly Performance scorecard** rests on unconfirmed metric definitions and is the most likely place to show a number a client disputes; (2) the **Reports/Analytics** tab still exposes Source/Client/Vendor filters but the by-dimension breakdowns and open-job-aging report the spec asks for were removed, so it looks thinner than the filters imply; (3) résumé upload depends on a **Blob token** that is set on this machine but missing from `.env.example` — fine here, a silent failure anywhere else. Steer the demo around the scorecard, or caveat it, and you present cleanly.

---

## 2. Top 5 Things to Fix Before the Demo

| # | Fix | Why it matters | Where |
|---|-----|----------------|-------|
| 1 | **Decide the Monthly Performance story** — fix Backouts bucketing (uses submit-week, not back-out week) and confirm New-vendors/Closures definitions, or hide/caveat the tab. | Most likely on-stage "that number is wrong" moment; metrics gated on open owner questions. | `src/server/queries/monthly-scorecard.ts`; `/reports?tab=monthly` |
| 2 | **Reconcile the Reports/Analytics tab with its filters** — restore a light jobs-by-client/vendor/source + open-job-aging view, or trim the now-orphaned filters. | A manager who filters by Vendor/Client expects a breakdown; spec §9.11 asks for it and it's gone. | `src/server/queries/reports.ts`; `/reports` |
| 3 | **Carry Job → VPR Client rate** (one-line default prefill). | Removes re-typing + transcription-error risk; the flow's one real redundancy. | `src/app/(dashboard)/vendor-portal/new/page.tsx:135` |
| 4 | **Add `BLOB_READ_WRITE_TOKEN` to `.env.example`** and confirm it's set wherever the demo runs. | Résumé/doc upload silently fails without it; works here, not guaranteed elsewhere. | `.env.example` |
| 5 | **Confirm intended RBAC** — should recruiters create jobs / see Settings? Today job-create is open and Settings is read-only-visible to recruiters. | Matches old MVP but conflicts with the three-tier "team lead owns jobs" framing; a likely client question. | `src/server/actions/jobs.ts`; `nav-links.tsx` |

---

## 3. Per-Persona Findings

### 3.1 Recruiter (day-to-day end user) — flow: **SMOOTH**
**Daily loop walked:** dashboard (my work) → jobs → job detail → candidates → candidate detail → submissions → submission detail (advance status) → interviews → placements. Every page rendered cleanly, **0 console errors, 0 network failures**.
- **Works:** Full pipeline is navigable; the redesigned **status action-bar** ("Advance to …" primary button + Hold/Reject/Backed-out branch buttons + clickable stepper) is a genuine improvement over the old dropdown — one click to advance, verified live with a success toast. Résumé upload streams from the private route. Global search + FilterBar present on every list.
- **Permission boundaries (all correct):** `/settings/export` and `/audit` render a **"Forbidden"** page; the VPR list shows **no create/submit controls** for recruiters; VPR-create URL bounces back to the list.
- **Friction (count = 2 meaningful):** (a) **Job → VPR rate re-entry** (H4) — the one place the recruiter/team-lead re-types data the system already has; (b) the **Job → submitted happy path is 4 screens / 3 forward clicks** (Job detail → VPR form → VPR detail → convert form) — no backward round-trips, so acceptable, but the direct "New submission" shortcut skips VPR prefill and starts blank (L1).
- **Open question:** a recruiter can open **"Add job"** and view **Settings** (read-only) — see M5.

### 3.2 Manager / Team Lead (oversight) — flow: **ROUGH at Reports**
- **Dashboard:** Both `?scope=me` and `?scope=org` render with real numbers; "Needs attention" surfaces expiring documents (12) with entity links. **KPIs reconcile:** Total submissions **160** = seed; Interviews **81** rounds; Joined **9** = placements. Scope toggle changes the data set (URL-param driven, works without JS).
- **Reports / Analytics:** Conversions render and reconcile — "**49 of 160** submissions reached an interview (31%)", "**21 of 49** selected (43%)", pipeline-by-stage and recruiter-performance tables populate. **BUT** the spec's by-source/by-client/by-vendor and open-job-aging reports were removed while their **filters remain** (H1) — the tab under-delivers versus what it appears to offer.
- **Monthly Performance:** Renders (per-recruiter, per-week grid), but the metric definitions (Backouts week-bucketing, New-vendors, Closures) are unconfirmed (H2) — **highest demo risk**.
- **Reconciliation caveat (M1):** "Interviews" = **81** on the dashboard (rounds) but **49** on Reports (interviewed submissions) — same label, different meaning; pre-empt the question.
- **Drill-down:** Works — recruiter summary → recruiter detail (8 stat cards + trend + timeline); submission counts link through to records.

### 3.3 Admin (control + config) — flow: **SMOOTH**
- **RBAC: 0 server-side leaks.** Every sensitive Server Action / Route Handler re-checks role at the top of the action body (not just UI hiding): org-entity writes (`requireAdmin`), VPR management (`canManageRequirements`), export routes (401+403), sensitive docs (serve + create), résumé serve route (401 before blob lookup), user management, audit page, submission self-claim gate. Settings write controls are `isAdmin`-gated, so recruiters see **read-only lists with no broken "Add" buttons**.
- **Config:** Settings exposes Sources/Clients/Vendors/Users management + Export + iLabor import. Export is admin-only (stricter than the "business = PII-free" framing — informational).
- **Cascade automation verified in code + live:** JOINED submission → auto-creates a `Placement` + flips candidate to PLACED; reverting → TERMINATED + candidate back to AVAILABLE. Duplicate candidate+job submission blocked at the action layer with an override-reason path.
- **Non-blocking:** bench marketing password is over-fetched server-side but discarded before render (L6).

---

## 4. Excel / Requirements Coverage Matrix

Sources: `docs/PROJECT_REQUIREMENTS.md` (§9 pages, §19 acceptance criteria) + June-19 Excel (6 tabs). Full detail in `test-results/coverage-matrix.md`. Summary counts: **~78 Present & Working · 4 Present-but-Suspect · ~12 Partial · 7 Missing.**

| Area | Status | Notes |
|------|--------|-------|
| **Dashboard** (§9.1) | Partial | KPIs, submissions-by-stage, recruiter table, filters all work. **Missing:** jobs-by-source, aging jobs; open-vs-closed only shows open side. |
| **Jobs** (§9.2–9.4) | Present & Working | Core list/form/detail solid. **Partial:** per-row #interviews/#selected/#joined columns missing; status not enforced-required. |
| **Candidates** (§9.5–9.7, §12) | Present & Working | Form, list, detail, duplicate email/phone warn + override. |
| **Submissions** (§8, §9.8, §12) | Present & Working | 3 entry points, duplicate prevention, 11-status pipeline, redesigned advance UI, detail. |
| **Interview Rounds** (§7.8) | Present & Working | Unlimited rounds, all fields + meeting link/mode/timezone. |
| **Interviews roll-up** (Excel tab) | Partial | Date/Candidate/Client/Type/Recruiter/Round/**Support(Y/N)** present. **Missing:** Vendor, Location, Remarks; Time merged into Date. |
| **Placements** (Excel tab) | Present & Working | Auto-create on JOINED, all fields, admin-masked rates, filters. No literal "pop". |
| **Bench roster** (Excel tab) | Present & Working | **All** fields incl. admin-gated marketing creds; High/Second priority grouping + display subset. |
| **Vendor Portal Requirements** (Excel tab) | Present & Working | 1:many → submissions, convert prefill. Email/Phone at candidate level; resume at convert step (Partial). |
| **Reports / Analytics** (§9.11) | Partial | Pipeline, recruiter perf, both conversions work. **Missing:** jobs-by-source/client/vendor, open-job aging. |
| **Monthly Performance** (Excel tab) | Present-but-Suspect | Grid + totals render; Backouts/New-vendors/Closures definitions unconfirmed. |
| **Recruiters** (§9.9/9.10) | Present & Working | List + all performance counts + detail. |
| **Search & Filter** (§10) | Present & Working | Global search (all entities + display IDs) + FilterBar + date presets. |
| **Files / Resume** (§11) | Present & Working* | Real private-Blob upload (PDF/DOCX). *Deviation:* Google-Drive-link entry removed (upload-only). Needs Blob token. |
| **Audit / Timeline** (§13) | Present & Working | Timeline on job/candidate/submission; 50+ audited actions; admin `/audit`. |
| **Settings / Admin** (§14) | Present & Working | Sources/clients/vendors/users + export + import. |

**§19 Acceptance Criteria:** 1–14 and 16 **met**; #15 (resume upload OR Drive link) **partial** — upload works, Drive-link entry removed.

**Missing (spec items with no working feature):** (1) Reports jobs-by-source/client/vendor; (2) open-job aging; (3) dashboard jobs-by-source; (4) dashboard aging jobs; (5) jobs-list per-row interview/selected/joined counts; (6) interviews Vendor/Location/Remarks columns; (7) Google-Drive-link entry path.

---

## 5. Redundancy / Duplicate-Work Audit

Full detail in `test-results/redundancy.md`. **Verdict: lean where deliberately wired, leaky at one seam.** Nothing forces a backward round-trip and nothing is confirmed twice for its own sake.

| # | Redundancy | Where | Severity | Fix |
|---|-----------|-------|----------|-----|
| 1 | **Job's Client rate re-typed on the VPR** (only `location` carries forward) | `vendor-portal/new/page.tsx:135` | HIGH | Seed `defaults.clientRate` from the job |
| 2 | Direct "New submission" entries start blank instead of prefilling from an OPEN VPR | `submission-form.tsx` | LOW-MED | Detect job's OPEN VPR and offer prefill |
| 3 | Two submission paths (convert vs direct) with inconsistent prefill effort | `requirements.ts` / `submissions.ts` | LOW-MED | Same as #2 |

**Good carry-forward to preserve (NOT redundant):** VPR → Submission **convert** prefills the entire commercial block + candidate + recruiter + notes, all editable; Job → VPR prefills location + auto-derives team lead from recruiter; self-claim is inlined into submit (no separate assign screen); job shown as read-only pinned header (no re-pick). The candidate-rate re-confirm nag and per-tier recruiter selection are intentional guardrails, not waste.

---

## 6. Flow-Smoothness Ratings

| Persona flow | Rating | Where a viewer would notice |
|--------------|--------|------------------------------|
| **Recruiter** — job → candidate → submit → advance → interview → note | **SMOOTH** | Clean, one-click advance, success toasts. Only seam: re-typing client rate at the VPR step. |
| **Admin** — config, RBAC, cascade automations | **SMOOTH** | Everything gated correctly; cascades fire; no dead ends. |
| **Manager** — dashboard & drill-down | **SMOOTH** | KPIs reconcile, scope toggle works, drill-through works. |
| **Manager** — Reports/Analytics | **ROUGH** | Filters for Source/Client/Vendor with no breakdown behind them; asked-for reports absent. Would prompt "where's the by-client view?" |
| **Manager** — Monthly Performance | **WOULD STALL A DEMO** | Metric definitions unconfirmed; a disputed Backouts/New-vendors/Closures number is likely. Avoid or caveat. |

---

## 7. Bug Log (severity-classified)

Machine-readable copy: `test-results/bugs.json`. **Counts: 0 critical · 4 high · 6 medium · 6 low.**

### 🔴 Critical — none

### 🟠 High
- **H1 — Reports by-source/client/vendor + open-job-aging absent** while filters remain (`reports.ts`, `/reports`).
- **H2 — Monthly Performance scorecard definitions unconfirmed** (Backouts week-bucketing; New-vendors/Closures) (`monthly-scorecard.ts`, `/reports?tab=monthly`).
- **H3 — Upload depends on `BLOB_READ_WRITE_TOKEN` missing from `.env.example`** — silent failure off this machine.
- **H4 — Job → VPR Client rate not carried forward** — re-typed by hand (`vendor-portal/new/page.tsx:135`).

### 🟡 Medium
- **M1 — "Interviews" ambiguous** (81 rounds vs 49 interviewed submissions across screens).
- **M2 — Jobs list missing #interviews/#selected/#joined columns** (§9.2).
- **M3 — Interviews roll-up missing Vendor/Location/Remarks** (Excel tab).
- **M4 — Dashboard missing jobs-by-source + aging jobs** (§9.1).
- **M5 — Recruiter can create jobs + view Settings (read-only)** — product-decision, not a leak.
- **M6 — Google-Drive link entry removed (upload-only)** — spec §11 deviation (owner-approved).

### ⚪ Low
- **L1 — Direct "New submission" doesn't prefill from an OPEN VPR.**
- **L2 — Job status not enforced required** (defaults OPEN).
- **L3 — No celebratory "pop" on Joined/Backed-out** (has confirm + toast).
- **L4 — Interview Time merged into Date column.**
- **L5 — CLAUDE.md doc drift** (Job "trimmed to client-rate-only" overstates — rates demoted, not removed).
- **L6 — Bench password over-fetched server-side** (discarded before render; latent).

---

## 8. What's Genuinely Strong (say this to yourself before you present)

- **Zero runtime errors** across 40+ pages under two roles — the app does not crash or throw in the console anywhere I walked.
- **Security is solid** — 0 server-side RBAC leaks; the trust boundary is the action, not the UI.
- **The two headline new features work live** — the redesigned status action-bar (one-click advance + branch dialogs + clickable stepper) and the private-Blob résumé/document upload (PDF/DOCX, gzip, auth-gated serve routes).
- **The core numbers reconcile** to the seed data.

Present the recruiter daily-loop and the admin cascade automations with confidence; keep the Reports → Monthly Performance tab out of the spotlight (or caveat it) until H1/H2 are resolved.
