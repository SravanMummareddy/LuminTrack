# LuminTrack — Application Guide & Demo Walkthrough

A guide to what LuminTrack does, how each part of it works, and the end‑to‑end
recruiting workflows it supports. Written for a walkthrough/demo with a
supervisor.

---

## 1. What is LuminTrack?

LuminTrack is an internal **recruitment tracking dashboard** for our recruiting
team. It replaces the manual Excel/Word process with a single place to track:

- **Job requirements** from clients
- **Candidates** and their profiles
- **Submissions** — each candidate put forward for a job — and their progress
- **Interview rounds** and outcomes
- **Notes** and a full **audit timeline** of every change
- **Recruiter performance** and management reporting

Everything is linked: a job has submissions, a submission has interview rounds,
and every action is recorded so we always know who changed what and when.

---

## 2. Getting started

### Accessing the app
Open the app URL in a browser. If you are not signed in you are sent to the
**Login** page.

### Logging in
Sign in with an **email and password**.

| Role | Example email | Password |
|------|---------------|----------|
| Administrator / Team lead | `sriman@lumintrack.com` (Sriman Udugula) | `LuminTrack2026!` |
| Recruiter | `hrishikesh@lumintrack.com`, `sameer@lumintrack.com`, `akhila@lumintrack.com`, … | `LuminTrack2026!` |

### Roles
- **Administrator** — full access, including managing app users in Settings.
- **Recruiter** — full access to jobs, candidates, submissions and reports;
  cannot add or edit users.
- **Team lead** — *not a separate role* but a flag on a user (set under
  **Settings → Users**, "Team lead" checkbox). Admins and team leads can
  **create and edit Vendor Portal Requirements** (the planning layer below);
  recruiters without the flag can still *move* an existing requirement to a
  submission, but not create or edit one.

Passwords and users are managed by an administrator under **Settings → Users**.

---

## 3. Navigation tour

The left sidebar has the following areas:

| Page | What it shows |
|------|---------------|
| **Dashboard** | Headline metrics, charts, open‑job aging and recruiter performance. |
| **Jobs** | Every job requirement and its pipeline (incl. the **iLabor Requisitions** source tab). |
| **Vendor Portal Requirements** | The planning queue — requirements scoped before they become submissions. |
| **Candidates** | Every candidate profile. |
| **Submissions** | Every candidate‑to‑job submission across all jobs. |
| **Interviews** | A read‑only roll‑up of every scheduled interview round. |
| **Bench** | The marketing roster of consultants currently being marketed. |
| **Placements** | Active and past placements with rates and margin. |
| **Recruiters** | Performance counts per recruiter; drill into one recruiter. |
| **Reports** | Management analytics — conversion funnel, performance, and Monthly Performance. |
| **Settings** | Sources, clients, vendors, app users, and data export. |

The **top bar** has a **global search** box (see Workflow 10) and the signed‑in
user with a **Sign out** option.

---

## 4. Core concepts

- **Job** — a requirement from a client. Has a client, a vendor, a **source**
  (a managed sister company, or a free-text entry), a status, rate information
  and assigned recruiters.
- **Candidate** — a person's profile: contact details, skills, experience, and
  an active/inactive status.
- **Résumé** — a labelled Google Drive link saved against a candidate. A
  candidate keeps a **library** of résumés (e.g. one tailored per role type);
  each submission picks the résumé used for that job.
- **Submission** — one candidate put forward for one job. This is the unit that
  moves through the hiring pipeline. A candidate can only be submitted to a
  given job **once**.
- **Interview round** — an interview attached to a submission (type,
  interviewer, date, result, feedback).
- **Note** — a free‑text comment that can be attached to a job, a candidate or
  a submission.
- **Activity timeline** — an automatic audit log shown on every detail page;
  records every create/update with the user and timestamp.

---

## 5. The recruiting workflow, end to end

These are the workflows the app supports, in the order they are normally used.

### Workflow 1 — Set up organisation data *(Settings, admin)*
Before jobs can be created, the supporting lists must exist.
1. Go to **Settings**.
2. Use the tabs to add records. Each tab has a **search box and a status
   filter** (All / Active / Inactive) to narrow long lists:
   - **Sources** — where jobs come through (typically sister companies). Each
     holds a name, contact person, email, phone and location.
   - **Clients** — the end companies hiring, with contact person, email, phone
     and location.
   - **Vendors** — the staffing vendors/partners, with the same contact
     details.
   - **Users** — recruiter and admin accounts (admin only). "Add user" sets a
     name, email, role and password; "Edit" can change details or reset a
     password.
3. Records are retired by marking them **inactive** rather than deleted, so
   history is preserved.

### Workflow 2 — Create a job requirement *(Jobs)*
1. Go to **Jobs** and click **Add job**.
2. Fill the form. Required: **Job title, Client, Vendor, Source**. The
   **Source** dropdown lists managed sources plus an **Other** option — choose
   *Other* to type a one-off source by hand. Optional: status (defaults to
   *Open*), vendor rate, candidate rate, location, description, notes.
3. Tick the **recruiters** assigned to work the job.
4. *(Admins / team leads)* Optionally expand **"Also plan a vendor portal
   requirement"** to pre-decide commercial terms (recruiter, location, pay /
   bill / candidate rates, engagement) at the same time — see Workflow 2a.
5. Save. The job appears in the Jobs list and on the assigned recruiters'
   pages.

### Workflow 2a — Plan a vendor portal requirement *(Vendor Portal Requirements, admin / team lead)*
A **vendor portal requirement** is a planning record: a team lead or admin
decides *who* a vendor requirement is for and *on what terms*, then a recruiter
**moves it to a submission** later. It is separate from a submission, so nothing
enters the pipeline (or any analytics) until it's moved.
1. Go to **Vendor Portal Requirements** → **New requirement** (or use **Create
   requirement** on a job's detail page, which pre-selects that job).
2. Pick the **job**, then fill any of: candidate (optional — can be added
   later), recruiter, location, pay / bill / candidate rates, engagement
   (C2C / W2), vendor recruiter, team lead (auto-filled from the recruiter's
   team if blank), résumé link and notes. Save — the requirement shows as
   **Open** in the list.
3. Edit or **Cancel** an Open requirement at any time (admin / team lead).
4. When ready, open the requirement and click **Move to submission**. The
   submission form opens **prefilled and fully editable**; submitting creates
   the real submission, links it back to the requirement (now **Converted**),
   and assigns the job to the submitting recruiter. The same duplicate / iLabor
   warnings as a normal submission apply, plus convert-time checks (placed
   candidate, archived résumé, zero or inverted rates) you can override with a
   reason.
5. A converted requirement is **read-only** and links to the submission it
   created; the move is recorded on its activity timeline.

### Workflow 3 — Add a candidate *(Candidates)*
1. Go to **Candidates** and click **Add candidate**.
2. **Full name** is required; provide **at least an email or a phone number**.
   Add location, work authorization, experience, current company, skills
   (comma‑separated) and a LinkedIn URL.
3. New candidates are **Active** by default. Uncheck **Active candidate** to
   retire someone who is no longer available — their past submissions are
   kept, and the Candidates list can be filtered by status.
4. If the email or phone matches an existing candidate, the app shows a
   **duplicate warning** naming the match. You can correct the details or
   choose **Save anyway** to proceed deliberately.

### Workflow 3a — Manage a candidate's résumés *(Candidate page)*
On the candidate's page, the **Résumés** section holds their résumé library.
1. Click **Add résumé**, give it a **label** (e.g. "Backend Engineer") and a
   **Google Drive link**.
2. Each résumé can be **previewed inline** (one at a time) or opened in a new
   tab, and can be **edited** or **deleted**.
3. A candidate can keep several résumés — typically one tailored per role type.
   Deleting a résumé does not change past submissions: each submission keeps a
   snapshot of the link it used.

### Workflow 4 — Submit a candidate to a job *(Job page)*
Submissions are always created from a job.
1. Open the **job** and click **Submit candidate**.
2. Pick the **candidate** and the **recruiter** submitting them. Candidates
   already submitted to this job are shown as **(already submitted)** and
   cannot be selected again — this prevents duplicate submissions.
3. Optionally set a candidate rate and submission notes, and **pick the résumé**
   for this job — a saved one from the candidate's library, or add a new one
   inline (it is also saved to their library). Choosing a résumé is optional.
4. Save. The new submission starts at status **Submitted**. The chosen résumé
   shows on the submission's detail page with an inline preview.

### Workflow 5 — Move a submission through the pipeline *(Submission page)*
Open a **submission** to see a **status pipeline** stepper. Update the status
as the candidate progresses:

`Submitted → Resume Picked → Vendor Screening Call → Client Interview →
Decision (Selected / Rejected / On Hold) → Offer Released → Joined`

Use the **status selector → Update** control. Alongside the new status you can
record **when the change happened** (pre-filled with the current date and time
— adjust it if the change happened earlier), a **note**, and — for **Rejected**
/ **On Hold** — a **reason** from a preset list. Every change is written to the
activity timeline, which shows the note, the reason, and both the event time
and when it was recorded.

Use **Edit submission** (top right of the submission page) to correct the
**submitted date**, the candidate rate, the résumé used, or the submission
notes after creation. The candidate, job and submitting recruiter are fixed at
creation and stay locked.

### Workflow 6 — Record interview rounds *(Submission page)*
1. On the submission, click **Add round**.
2. Enter a **round name** (e.g. "Technical Round 1"), an **interview type**
   (Vendor Screening, Client Interview, Manager Round, HR Round, Final Round,
   Other) and a **result** (Waiting, Need Another Round, Selected, Rejected,
   On Hold, Completed).
3. Optionally set the **interview mode** — *In person*, *Phone call* or *Video
   call*. Choosing *Video call* reveals a **platform** field (Microsoft Teams,
   Google Meet, Zoom, Other). Also optional: interviewer name, date/time,
   feedback and notes.
4. Rounds are listed in order on the submission and feed the "Interviews"
   counts across the app.

### Workflow 7 — Record the outcome
The outcome is just the final pipeline status on the submission:
- **Selected** — client selected the candidate.
- **Offer Released** — an offer has gone out.
- **Joined** — the candidate started.
- **Rejected** / **On Hold** — closed or paused, with an optional reason.

These statuses drive the Dashboard and Reports numbers automatically.

### Workflow 8 — Add notes
On any **job, candidate or submission** detail page, use **Add note** to record
a comment. Notes are timestamped and attributed to the author, and appear in
the entity's notes section and activity timeline.

### Workflow 9 — Track progress *(Dashboard, Reports, Recruiters)*
- **Dashboard** — headline KPIs (Active jobs, Total submissions, Interviews,
  Selected, Offers released, Joined, Rejected, On hold), plus charts (jobs by
  status, jobs by source, submissions by pipeline stage), an **open‑job aging**
  breakdown, and a recruiter performance table.
- **Reports** — a **conversion funnel** (Submission → Interview, Interview →
  Selection) and **performance breakdowns** by client, vendor, source and
  recruiter, plus an open‑job aging report.
- **Recruiters** — performance counts per recruiter; click a recruiter to see
  their stats, a six‑month submission trend, assigned jobs, submissions and
  recent activity.

All three pages share a **date‑range and attribute filter** so any view can be
narrowed to a period, client, vendor or source.

### Workflow 10 — Find anything *(Global search)*
Use the **search box in the top bar** to jump straight to a candidate, job,
client, vendor, source or recruiter. Start typing and pick a result.

---

## 6. Working with the list pages

The **Jobs, Candidates, Submissions and Recruiters** lists all behave the same
way:

- **Filter bar** — the most‑used filters (search, status) stay visible. Click
  **Filters** to expand the rest; a badge shows how many advanced filters are
  active. Applied filters appear as **chips** that can be removed individually.
  Click **Apply** to run the filters, **Clear** to reset.
- **Sorting** — click any **column header** to sort by it; click again to
  reverse the direction. An arrow shows the active sort column.
- **Pagination** — lists show **10 rows per page** with page controls at the
  bottom ("Showing 1–10 of …"). Filters and sort are kept as you page.

---

## 7. Status reference

**Job statuses:** Open · On Hold · Closed · Filled · Cancelled

**Submission pipeline:** Submitted · Resume Picked · Vendor Screening Call ·
Client Interview · Selected · Rejected · On Hold · Offer Released · Joined

**Interview results:** Waiting · Need Another Round · Selected · Rejected ·
On Hold · Completed

---

## 8. Data integrity and audit

- **No hard deletes** — jobs and candidates are retired via status; clients,
  vendors and sources via an active/inactive flag. History is never lost.
- **Duplicate protection** — candidates are flagged on matching email/phone;
  the same candidate cannot be submitted to the same job twice.
- **Full audit trail** — every create and update writes an activity entry
  (who, what, when), visible on the relevant detail page's timeline.

---

## 9. Suggested demo script (about 10 minutes)

1. **Log in** as the administrator and land on the **Dashboard** — point out
   the KPI cards and charts.
2. Open **Settings** — show the Sources, Clients, Vendors and Users tabs (the
   supporting data), and the per-tab search / status filter.
3. Go to **Jobs** — show the list, demonstrate **filtering**, **sorting** a
   column, and **pagination**. Open one job to show its detail and pipeline.
4. From the job, click **Submit candidate** — show that already‑submitted
   candidates are blocked (duplicate prevention).
5. Open a **Submission** — walk the **status pipeline**, update a status, and
   **Add an interview round**.
6. Open a **Candidate** — show the profile, the active/inactive status, and the
   **Résumés** library (add / preview / edit); mention the **duplicate
   warning** on add.
7. Visit **Reports** — show the conversion funnel and performance breakdowns.
8. Visit **Recruiters** — open one recruiter to show their performance detail.
9. Use the **global search** in the top bar to jump to any record.
10. Finish on any detail page's **activity timeline** to show the full audit
    trail.

---

*LuminTrack — internal recruitment tracking for the Lumin recruiting team.*
