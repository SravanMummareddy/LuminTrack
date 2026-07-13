# LuminTrack — A Few Decisions We Need From You

Thanks for the detailed feedback. Before we start building, there are a handful of choices only
you can make. They're written in plain terms below — no technical knowledge needed. The **first
four are the important ones**; the rest are quick confirmations.

---

## The 4 that matter most

### 1. Who sees what — roles & the org chart

We'll set up the app so **recruiters and team leads** see only their day-to-day work (jobs,
candidates, submissions, interviews, placements) — **no company dashboards, reports, settings, or
money figures.** **Managers/admins** see everything.

**We need you to confirm:**

- Is **"Admin"** a _different_ kind of user from **"Manager"**, or are they the same level of
  access (just different people)?
  - same level of access just a different job titles
- We'll build an **org chart** (CEO → Admin → Manager → Team Leads → their recruiters) so the app
  knows who reports to whom. **Can you give us the actual list** — who the team leads are, and
  which recruiters sit under each?
  - utilize well know libraries, if needed, lets levarage them, no need to build everything from scratch
  - we can always customize it.
  - ceo, under ceo we have multiple maangers, admin, under manager /departments - we have teams - team lead and team members

### 2. The submission stages

You mentioned this flow: **Submitted → Résumé → Vendor Screen → Interview → Follow-up → Offer
Accepted → Joined.**

**We need you to confirm:**

- Is that the exact list, in that order?
- Which stages can be **skipped** when they don't apply (e.g. a direct interview with no vendor
  screen)?
  - ideally no stage can be skipped, but we always can't guess what happens, what if candidate doesn't
    go through vendor screening and goes to interview, what if there is no interview. we note them down but
    shouldn't skip it.
- For each stage, **what must the recruiter fill in** before moving on? (e.g. for an interview:
  who interviewed, phone or Zoom, was there a support person, the date.)
  yes all that, and lets decide while building - lets look at what are there in intervew details tab, similarly for others

### 3. How we count two things on the scorecard

Your performance sheet tracks **"New vendors"** and **"Closures."** We need your exact definition
so the numbers match your expectation:

- **New vendors** — new to the _whole company_, or new to _that recruiter_? Counted the month
  they're first used?
- **Closures** — does that mean a candidate _joined/started_, or something earlier (offer
  accepted)?

* have little clarity on both of them, lets not assume anything, its just wiring fix, so can be done later i feel - thoughts?

### 4. The Bench module

There was an earlier plan for a larger **6-tab Bench-Sales section** (from the June stakeholder
sheet). **Do you still want that built**, or is the current Bench tab enough for now?

- current is good enough

---

## Quick confirmations (a yes/no or a short answer is fine)

5. **Filling every field** — we'll make _every_ field required except Notes, with a "Don't
   know / Not mentioned" option when a recruiter genuinely doesn't have the info. **Good?**
   - yes, ask me which field are absoluetly mandatory, which can have not applicable, or don't know etc
   - do this for all of the forms

6. **Client rate** — this one is often not disclosed by the vendor. OK for recruiters to mark it
   **"not disclosed"** rather than being forced to invent a number?
   yes

7. **"At least 2 submissions" reminder** — if a requirement has fewer than 2 submissions, we'll
   show a gentle nudge (not a hard block). Should that count **per requirement** or **per job**?
   - ideally we have one requirement for one job, but to answer your question yes per requirement

8. **Interviews** — do you want interviews to have their own clickable ID + detail page, or is the
   current inline view fine?
   - need guidence on it? which is best?

9. **Reminder emails** — which are must-haves for version 1? (a) "You've been assigned a
   requirement," (b) "This requirement only has 1 submission," (c) "A candidate's visa/passport is
   expiring," (d) "You have an interview coming up."
   - all of them and also if team lead assigned a vpr to you etc

10. **Where should the app live long-term?** Options: (a) we keep it running as-is on the current
    setup (simplest), (b) move it into your own company accounts, or (c) host it on your own
    server. Also — **do you want it on your own domain** (e.g. `app.yourdomain.com`)? And should
    people **sign in with their Google account**?
    - lets focus on featuers and bugs for now, need to discuss with user on this

11. **Which job fields should we remove?** You mentioned a few fields aren't needed — tell us which
    ones and we'll clean them up.
    for each and every tab, form, list out fields and do anlaysis and let me know - if anything can be added or removed
    i will decide based on that

12. **Expired work authorization** — if a candidate's work permit has expired, should the app
    **block** a new submission, **warn but allow** it, or just **show a flag**?
    soft warn and show flag but allow submission

---

_Once we have 1–4, we can start building the big pieces. The quick wins (bug fixes and
navigation/usability improvements) we can begin on right away, in parallel._
