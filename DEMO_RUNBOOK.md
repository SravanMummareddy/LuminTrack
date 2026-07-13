# LuminTrack — Live Demo Runbook

**Audience:** non-technical stakeholder. Keep it about *the work*, not the software.
**Login:** `sriman@lumintrack.com` / `LuminTrack2026!` (admin — sees everything incl. rates).
Backup recruiter account for the RBAC moment: `hrishikesh@lumintrack.com` / same password.

> Golden rule for the room: for every screen say **(1) what problem it solves**, then
> **(2) show one real example**, then move on. Don't explain the software — explain the job.

---

## 0. The 20-second pitch (say this first)

> "Today the team tracks jobs, candidates, and submissions across Excel sheets, Word docs,
> and email. Things fall through the cracks and nobody has one clear picture. LuminTrack is
> one place for the whole recruiting pipeline — from a job coming in, to a candidate placed
> and billing — plus live numbers on how the team is doing."

---

## 1. The mental model — draw this in the air (30 sec)

Recruiting is a pipeline. Money and people flow left → right:

```
  JOB            →   REQUIREMENT     →   SUBMISSION   →   INTERVIEWS   →   PLACEMENT
 (the order)        (the terms/price)   (we put a         (the rounds)     (they start —
                                         person forward)                    billing begins)
```

Say it in plain words:

- **Job** = an order we need to fill ("client needs a Java developer in Dallas").
- **Requirement (Vendor Portal Requirement)** = the *deal terms* for that order — what we'll
  bill and what we'll pay. Planning happens here before anyone is submitted.
- **Candidate / Bench** = the *people*. Bench = the consultants we're actively marketing right now.
- **Submission** = we formally put a candidate forward for a job. **This is the record the
  team's performance is measured on.**
- **Interview** = the rounds that candidate goes through.
- **Placement** = they got it and started. This is where revenue begins.

**The money, in one breath:** *"We receive the **bill rate**, we pay the consultant the
**pay rate**, and the difference is our **margin**."* (That's all a non-technical audience needs.)

---

## 2. The guided walkthrough — click in THIS order

### ▶ Dashboard (`/`) — "the morning glance"
- **Say:** "First thing a recruiter or manager sees — what needs attention today."
- **Show:** the KPI cards (active jobs, submissions, interviews), and the **"Needs attention"**
  card (stale submissions, documents expiring, rates pending).
- **Point out:** the **Me / Org** toggle — a recruiter sees *their* work; a manager sees the
  whole team. Same app, right view for each person.

### ▶ Jobs (`/jobs`) — "the orders"
- **Say:** "Every job we're working, from any source."
- **Show:** open a job detail. Point at status, client/vendor, location, number of positions.
- **Nice touch:** many jobs are **imported automatically** from the vendor portal (iLabor) —
  no re-typing. Mention the source tabs.

### ▶ Vendor Portal Requirements (`/vendor-portal`) — "the deal terms"
- **Say:** "Before we submit anyone, a team lead sets the commercial terms — bill rate, pay
  rate, engagement type. This is the planning layer."
- **Show:** open one, then show the **"Move to submission"** button.
- **Why it matters:** the terms are set once, up front, and flow into the submission — no
  guessing rates later.

### ▶ Candidates (`/candidates`) — "the people"
- **Say:** "Our talent pool — searchable, with résumés and documents attached."
- **Show:** open a candidate → **résumé preview inline**, the **documents** section (work
  authorization, IDs), and the **expiry warnings** (green / amber / red pills). "The system
  warns us *before* a work permit expires."
- **Point out:** status, skills, discipline (IT / Non-IT).

### ▶ Bench (`/bench`) — "who we're marketing now"
- **Say:** "The consultants we're actively selling this week — their marketing details live here."
- **Show:** the roster grouped by priority; open one to show the **Marketing details** card.

### ▶ Submissions (`/submissions`) — "the heart of it"
- **Say:** "When we put a candidate forward for a job, it's tracked here start to finish."
- **Show:** the pipeline statuses (Submitted → Interview → Selected → Offer → **Joined**).
  Open one submission to show its full history/timeline.
- **Best live moment:** click **"New submission"** and walk the form halfway — pick a candidate,
  pick a job. Point out it **warns on duplicates** and **flags rate problems** live. (You don't
  have to save it.)

### ▶ Interviews (`/interviews`) — "the rounds"
- **Say:** "Every scheduled interview round in one list — who, when, what result."
- **Show:** the roll-up; note the **Join link** for the meeting and round results.

### ▶ Placements (`/placements`) — "where we make money"
- **Say:** "When a candidate joins, a placement is created automatically. This is billing."
- **Show:** an active placement — bill rate, pay rate, **margin**, extensions.
- **Callout:** "The moment a submission flips to *Joined*, this appears on its own — the
  recruiter doesn't do double data-entry."

### ▶ Reports (`/reports`) & Recruiters (`/recruiters`) — "how are we doing?"
- **Say:** "For managers — the numbers, without a spreadsheet."
- **Show:** Reports → funnel/conversion, time-to-fill, projected margin. Recruiters →
  per-person leaderboard.
- **Non-technical framing:** "This answers 'is the team productive and is the business healthy?'
  automatically, every day."

### ▶ Settings (`/settings`) — "admin, briefly"
- **Say:** "Clients, vendors, glossary, exports, and a recycle bin for anything deleted."
- **Show (optional):** the **Export** page — one click to a clean Excel of the data. "Your data
  is never locked in."

---

## 3. The "wow" moments — hit at least two

1. **One flip, no double entry:** move a submission to **Joined** → a **Placement** appears
   automatically with the rates carried over. "Enter it once, it flows everywhere."
2. **Role-based access:** log out, log in as **hrishikesh** (recruiter). Show that sensitive
   rate/margin numbers and admin tools are hidden. "Everyone sees what they should — nothing more."
3. **It warns before things go wrong:** duplicate-submission warning, rate-chain warning, and
   document-expiry pills. "The system catches mistakes people miss."
4. **Nothing is ever really lost:** deleting sends things to **Trash**, then a recoverable
   backup — not gone. Good for a nervous stakeholder.

---

## 4. How data flows (say this if they ask "how does it all connect?")

> "A **Job** comes in. A team lead adds the **deal terms**. A recruiter picks a **Candidate**
> and creates a **Submission** against that job. The candidate goes through **Interviews**. If
> they're selected and join, a **Placement** is created automatically and billing begins — and
> all of that instantly rolls up into the **Dashboard** and **Reports**. One entry, one source
> of truth, live numbers."

Money chain, if pressed: **Client rate ≥ Bill rate ≥ Pay rate.** *"We receive the bill rate,
pay the consultant the pay rate, margin is the difference."* Stop there.

---

## 5. If something breaks / gotchas

- **Login bounces to /login after a reseed:** just log in again — the demo DB was just refreshed.
- **A page says "Something went wrong":** refresh once. If it persists, skip it — don't debug live.
- **Don't** open the same submission's *Update status* twice trying to undo — just narrate.
- Keep two tabs open: one on **Dashboard**, one on a **candidate detail** — the two most
  visual screens — so you can jump if a screen is slow.

---

## 6. Likely questions + short answers

- *"Can we get our data out?"* → Yes — Settings → Export → Excel or full backup, one click.
- *"Who can see rates/margins?"* → Only managers/team leads. Recruiters don't. (Show it.)
- *"What happens to old candidates/jobs?"* → Retired, not deleted; recoverable from Trash.
- *"Does it replace our Excel/iLabor process?"* → It *absorbs* it — iLabor jobs import
  automatically; the Excel fields all live here now.
- *"Is it live?"* → Yes, it's deployed and running (this is the real app, real data shape).

---

### One-line close
> "Everything the team does today across five tools now lives in one place, updates itself,
> and tells you how the business is doing — in real time."
