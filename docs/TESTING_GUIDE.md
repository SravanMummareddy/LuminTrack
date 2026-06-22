# LuminTrack — Testing & Walkthrough Guide

A living guide for manual testing. It lists **what each feature does**, the
**process flows & lifecycles**, and a **"what to test" checklist** per area.
Work through it, then send back bugs / improvements / doubts.

> **How to report back:** for each issue note (1) the page/URL, (2) what you did,
> (3) what you expected, (4) what happened. A screenshot helps. I'll fix, then
> add a "Verify this fix" line to the **Change log to verify** section at the
> bottom so you can re-test just the delta.

---

## 0. Setup before testing

1. **Dev server:** keep the one you already started (`npm run dev` → http://localhost:3000). Don't start a second — two dev servers corrupt the build cache. Code changes hot-reload; hard-refresh (Cmd+Shift+R) if something looks stale.
2. **Reseed demo data (recommended once):** `npx tsx prisma/seed-demo.ts`
   - Wipes and reloads ~3 months of realistic data **including** Vendor Portal Requirements, team-lead flags, and interview rounds flagged "support needed".
   - It **logs you out** (users get new IDs) — just reload and log back in; the app self-clears the old session.
3. **Login:** `sriman@lumintrack.com` / `LuminTrack2026!` (all demo users share this password). Sriman is an **Admin + Team lead**.
4. To test the **recruiter** experience, log in as e.g. `hrishikesh@lumintrack.com` (recruiter, no team-lead flag).

---

## 1. Roles & permissions (test the difference)

| Capability | Admin | Team lead (recruiter+flag) | Recruiter |
|---|---|---|---|
| Jobs / candidates / submissions / interviews | ✅ | ✅ | ✅ |
| Manage users, clients, vendors, sources, export | ✅ | ❌ | ❌ |
| **Add client/vendor inline on job form** | ✅ | ❌ | ❌ |
| **Create / edit Vendor Portal Requirements** | ✅ | ✅ | ❌ |
| **Move a requirement → submission** | ✅ | ✅ | ✅ |
| See placement rates | ✅ | only own placements | only own placements |
| See bench marketing credentials | ✅ | ❌ | ❌ |

**To test:** log in as a plain recruiter and confirm the gated controls are
hidden (no "New requirement", no "+ Add new client", no Settings → Users, rates
masked on others' placements).

---

## 2. The master flow

```
Job (requirement)
   └─(optional) Vendor Portal Requirement ──Move to submission──┐
                                                                ▼
Candidate ───────────────────────────────────────────► Submission
                                                           │
                                                  Interview round(s)
                                                           │
                                                       JOINED
                                                           ▼
                                                      Placement ──► extend / end
```

A **Candidate** is the base identity. **Bench** (being marketed) and
**Placements** (placed) are lifecycle views on top of candidates, kept in sync
automatically.

---

## 3. Lifecycles & automatic cascades

**Submission status**
```
SUBMITTED → RESUME_PICKED → VENDOR_SCREENING_CALL → CLIENT_INTERVIEW
  → SELECTED / ON_HOLD / REJECTED → OFFER_RELEASED → OFFER_ACCEPTED → JOINED
  (BACKED_OUT = terminal negative outcome from any stage)
```

**Vendor Portal Requirement:** `OPEN → CONVERTED` (becomes a submission) or `OPEN → CANCELLED`.

**Candidate status:** `AVAILABLE → PLACED` (on JOINED) → back to `AVAILABLE` when no active placement remains; plus manual `NOT_INTERESTED` / `DO_NOT_CONTACT`.

**Placement:** `ACTIVE → EXTENDED → ENDED / TERMINATED`.

**Bench marketing status:** `ACTIVE / PAUSED` = on bench · `PLACED` (synced on JOIN) · `INACTIVE` = removed.

**Job:** `OPEN → ON_HOLD → CLOSED / FILLED / CANCELLED`.

**Cascades to verify (the automation):**
- [ ] New candidate created **Available** → auto-creates a linked **Bench** row.
- [ ] Submission → **JOINED** → auto-creates a **Placement**, flips candidate → **Placed**, bench → **Placed**.
- [ ] Revert a JOINED submission → placement **Terminated**, candidate back to **Available**, bench back to **Active**.
- [ ] **Move requirement → submission** → creates the submission **and** auto-assigns the job to the submitting recruiter.

---

## 4. Module-by-module test checklists

### Dashboard (`/`)
- [ ] KPI cards + charts (jobs by status, submissions by stage, sources) render.
- [ ] `me` / `org` scope toggle changes the data.
- [ ] "Needs attention" shows your stale submissions, rounds awaiting result, **requirements to move**, expiring documents.
- [ ] Each "Needs attention" item links to the right detail page.

### Jobs (`/jobs`)
- [ ] Source sub-tabs: All / Manual / **iLabor Requisitions** filter correctly.
- [ ] Add job: required fields enforced (title, client, vendor, source).
- [ ] **Source → "Other — enter manually"** reveals a name box **right under the dropdown** and you can type in it. *(recently fixed)*
- [ ] **Client/Vendor → "+ Add new…"** (admin only) reveals a name box; saving creates the client/vendor and links the job. *(new)*
- [ ] Re-using an existing name (any case) does **not** create a duplicate. *(new)*
- [ ] "Also plan a vendor portal requirement" section (admin/lead) creates a requirement alongside the job.
- [ ] Job detail: iLabor card, submitted-candidates table, **Vendor portal requirements** section + "Create requirement" button, notes, timeline.
- [ ] Column show/hide + drag-reorder persists; sorting + pagination + filters work.

### Vendor Portal Requirements (`/vendor-portal`)  *(the planning layer)*
- [ ] List shows requirements with the sheet columns; default filter = **Open**.
- [ ] **New requirement** (admin/lead): pick a job, fill terms, save → appears as Open.
- [ ] Edit an Open requirement; **Cancel** marks it Cancelled.
- [ ] **Move to submission:** form opens prefilled + editable → submitting creates the submission, links back (requirement → **Converted**, read-only), and assigns the job to you.
- [ ] Recruiter (no flag) sees no New/Edit/Cancel, but **can** Move to submission.
- [ ] Convert warnings (override with a reason): candidate placed, archived résumé, zero/inverted rates; block (no override): job closed, candidate inactive/do-not-contact.
- [ ] Display IDs read `VPR-001`.

### Candidates (`/candidates`)
- [ ] Add candidate; duplicate email/phone warning fires.
- [ ] Résumé library: add / archive; archived ones aren't offered for new submissions.
- [ ] Document library: categories, expiry pills (slate/amber/red), 30-day banner; Identity/Work-Auth gated to admin.
- [ ] Status / tags / source / last-contacted show on detail.
- [ ] **Interview history:** grouped per submission, result pips, expand shows rounds — and a **"Support needed"** badge on rounds that have it. *(new)*

### Submissions (`/submissions`)
- [ ] Three entry points: from a job, from a candidate, and global "New submission".
- [ ] Assignment gate + "Claim this job" self-claim for recruiters.
- [ ] Duplicate / iLabor override gates require a reason.
- [ ] Status pipeline moves; reasons captured; "mine, stale >7d" filter.
- [ ] Bench fields (engagement, vendor recruiter, job duties, pay/bill) save.

### Interviews (`/interviews`)
- [ ] Read-only roll-up, date-sorted; rows link to candidate + submission.
- [ ] **Support** column shows "Yes" when the round needs support.
- [ ] Each row shows a **`SUB-012 · R2`** handle (submission id + round). *(new)*
- [ ] Setting "Support needed" on a round (submission page) → that round card shows a **"Support needed"** badge. *(new)*

### Bench (`/bench`)
- [ ] Grouped HIGH / SECOND priority; **S.No restarts per group**; each group paginates independently. *(recently fixed)*
- [ ] Marketing status filter defaults to on-bench.
- [ ] Marketing credentials masked; Reveal is admin-only and audited.
- [ ] One-click "Remove from bench".

### Placements (`/placements`)
- [ ] Full-width layout with the summary strip (active · weekly margin · ending in 14d). *(recently fixed)*
- [ ] Auto-created on JOINED; rates/margin shown only to admin or recruiter-of-record.
- [ ] Extend (overlap blocked) and End (with replacement picker) work.
- [ ] Rates-pending (0/0) flagged amber.

### Recruiters (`/recruiters`) & Reports (`/reports`)
- [ ] Recruiters: per-recruiter counts; drill-in.
- [ ] Reports → **Analytics**: funnel, time-to-fill, time-in-stage, aging, revenue projection, active-placement margin.
- [ ] Reports → **Monthly Performance**: scorecard by recruiter/week (submissions, interviews, new vendors, closures, backouts) with team totals; month/team picker.
- [ ] **Date range** filter: "Custom range" reveals From/To inputs; the control looks clean (no broken icon). *(recently fixed)*

### Settings (`/settings`)  *(admin)*
- [ ] Settings page loads (no crash). *(recently fixed)*
- [ ] Sources / Clients / Vendors CRUD + contacts.
- [ ] Users: add/edit, the **Team lead** checkbox.
- [ ] Export: Excel (business/full) + JSON backup; export history.
- [ ] Audit log: filter by action/user; requirement rows link to `/vendor-portal/:id`.

### Cross-cutting
- [ ] Global search (top bar): ↑/↓/Enter navigation.
- [ ] Activity timeline present on every detail page.
- [ ] Nothing hard-deletes (retire/archive instead).
- [ ] Mobile widths (resize narrow): tables collapse to cards, "Sort by" control appears.

---

## 5. Change log to verify (this round)

These are the items changed most recently — quick targeted re-tests:

- [ ] **Auth loop fix:** after a reseed, opening the app just lands you on /login (no "too many redirects"). Log in normally.
- [ ] **Settings crash fixed:** `/settings` opens without "Something went wrong".
- [ ] **Placements hydration:** `/placements` loads with no console error even if you've reordered columns.
- [ ] **Date range icon:** Reports/Recruiters date filter looks clean.
- [ ] **Source manual entry:** Add-job → Source → "Other" → type a name right under the dropdown.
- [ ] **Inline add client/vendor:** Add-job (as admin) → "+ Add new client/vendor" → type a name → job links to the created/reused record.
- [ ] **Interview support flag:** badge shows on submission round cards + candidate history.
- [ ] **Interview round handle:** `SUB-### · Rn` on the Interviews list.
- [ ] **Vendor Portal Requirements (R0–R5):** full create → edit → move-to-submission flow.

---

*Keep this file open while testing. I'll append new "Change log to verify"
entries here each time I ship a fix, so you always have a focused re-test list.*
