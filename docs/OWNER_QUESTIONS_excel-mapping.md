# LuminTrack — questions for the owner (Excel ↔ app mapping)

_Prepared 2026-07-10, after reading `Dashboard-req.numbers` (6 tabs)._

## TL;DR

- The **Monthly Performance** tab in the app already matches the owner's sheet **column-for-column** — same five metrics, same order. **Nothing is unmapped.**
- The "blanks" in the app's scorecard are simply **zeros** (rendered as `—`). Even the owner's own sheet shows **Closures = 0 and Backouts = 0** for everyone, so blank columns there are expected, not broken.
- The real things to confirm are a handful of **definitions** — above all **"New vendors"** and **"Closures"** — because how we count them changes whether a cell shows a number or a `—`.
- A few small display/field confirmations on the other tabs are listed at the end.

---

## Part A — Monthly Performance (the "blanks")

### A1. The columns already match 1:1

Owner's sheet header (per week Week1–Week5, plus a Monthly total):

`EMP ID | Recruiter Name | Submissions | Interviews | New vendors | Closures | Backouts`

App scorecard columns: `Subs | Ints | Vnds | Cls | Backs` = **exactly the same five**, per recruiter, bucketed by week + a Total. **So there is no missing column to map.**

### A2. Why cells are blank

A blank cell (`—`) = a **zero** for that recruiter / week / metric. Two reasons a column looks mostly empty:

1. **It's genuinely rare.** In the owner's own sheet, **Closures and Backouts are 0 for every recruiter, every week** — so those columns being empty in the app is correct.
2. **We may be counting a stricter event than the owner does** — this is the part worth confirming (below). The clearest example: **New vendors**.

### A3. The definition questions (this is the real ask)

For each metric, "how we count it today" vs "what to confirm":

**1. New vendors — most likely mismatch.**
- App today: a vendor **new to the whole company** — the first time *anyone* ever submitted to that vendor. This is strict, so the app shows mostly 0–2.
- Owner's sheet shows **5, 6, 7 per recruiter per week** (e.g. Sameer 5/6/2; Akhila 5/4/7/3). That volume is impossible under "company-first-ever."
- **Question:** does "New vendors" mean (a) a vendor **new to that recruiter** (first time *this* recruiter submits to it), (b) **distinct vendors** the recruiter submitted to that week, or (c) company-first-ever (current)? _(We suspect (a) or (b).)_

**2. Closures — needs a definition.**
- App today: a submission reaching **Offer Accepted**.
- The sheet also has a whole **Placements** tab with "Date of Placement / Start Date / Joined," which suggests a "closure" may mean an actual **joining/placement**, not just an accepted offer.
- **Question:** is a "Closure" counted when the **offer is accepted**, or when the candidate **actually joins** (placement / start date)?

**3. Backouts.**
- App today: a submission reaching **Backed Out** (counted in the week it happened).
- **Question:** does a backout count at **any stage**, or only **after offer/joining**? (The Placements tab notes "Joined or Back out," hinting backout is tracked at the placement stage too.)

**4. Interviews.**
- App today: interview rounds counted on the round's **scheduled date**; a round with **no date set doesn't count**.
- **Question:** should an interview count as soon as a round is **logged** (even without a scheduled date)? Count **every round**, or only certain interview types?

**5. Submissions.**
- App today: **one per submission row**, on the submitted date. A candidate submitted to two jobs counts twice.
- **Question:** confirm that's the intended count (per submission, not per unique candidate).

**6. Week boundaries.**
- App today: **Monday-start weeks** overlapping the month (labelled e.g. "Jun 1–7").
- Owner's sheet uses **Week1…Week5**.
- **Question:** are the owner's weeks **calendar 1–7 / 8–14 / 15–21 / 22–28 / 29+**, or **Monday-start**? (So the app's week columns line up with his.)

> **Optional display note:** the app shows a zero as `—`. If the owner prefers to see a literal `0`, that's a one-line change — just say the word.

---

## Part B — Reconciling the other five tabs (quick confirmations)

We've already built all five tabs; these are small "did we read your column right?" checks.

### B1. Bench Details
Owner's full columns are all present in the app (Reference, Technology, Marketing Exp, Real-time Exp, M Visa, A Visa, Company, Project Type, Least rate on C2C, Current Location, Relocation, Call Type, Payroll Type, Marketing Start Date, Marketing Email, Password, Marketing number). Owner's **roster ("Need to display")** = `S.No · Candidate · Technology · Visa · Experience · Location · Relocation · Recruiter`, grouped **High / Second priority** — the app matches.
- **Question:** the roster "Visa" column — should it show the **M Visa (marketing)** or the **A Visa (actual work authorization)**?
- Note: we dropped "Personal Number" as redundant with the contact phone — OK to keep it dropped?

### B2. Bench Submissions
Owner columns match the app's Submission (Date, Candidate, Job Title, Vendor, Client, Pay, Bill, Location, **Bench/W2**, Recruiter, Team lead, Company, Job Duties, Resume, Email, Phone, Vendor Recruiter).
- **Question:** the owner's column is **"Bench/W2"**; the app calls it **engagement = C2C / W2**. Is "Bench" the same as "C2C" for him, or a separate option to add?

### B3. Vendor Portal Requirements
All owner columns present (Candidate, Job Title, Vendor, Client, Pay, Bill, Location, C2C/W2, Recruiter, Team lead, Company, Vendor Recruiter, Email, Phone, Resume-to-upload). **No open question** — matches.

### B4. Interviews
Owner columns: `Date | Candidate | Technology | Location | Time | Vendor | Client | Interview Type | Sales Recruiter | Round | Support (Y/N) | Remarks`. Owner's list view = `Date · Candidate · Client · Sales Recruiter · Technology`.
- **Question:** owner lists **Location** and **Time** as *separate* columns. The app stores one **date-and-time** plus interview **mode** (in-person / phone / video) and a meeting link. Do we need a separate free-text **Location** field on an interview, or is mode + meeting link enough?
- Confirm the list should surface **Technology** (we read it from the candidate).

### B5. Placements
Owner columns: `S.No | Consultant | Organisation | Vendor | Client | Role | Location | Bill | Pay | Recruiter | Lead | Date of Interview | Date of Placement | Start Date | Remarks`, with a note that **Remarks should pop "Joined / Back out."** Owner's list = `Consultant · Vendor · Client · Role · Bill · Pay · Recruiter`.
- **Question:** what is the **"Organisation"** column — the consultant's own employer/LLC, our company, or the implementation partner?
- **Question:** owner tracks **both "Date of Placement" and "Start Date"** (plus "Date of Interview"). The app tracks a placement **start date** (and offer/join dates on the submission). Do we need to store **"Date of Placement"** as a distinct field from **Start Date**?

---

## Part C — Previously-answered owner questions (for reference)

These five were confirmed on 2026-07-06 and are already built (listed so nothing is re-asked):

1. **Rate chain** — Client ≥ Bill ≥ Pay (client rate often "Undisclosed"). ✅
2. **Legacy Candidate rate** — retired/removed. ✅
3. **"New vendors"** — was answered "company-wide"; **Part A3 above may reopen this** given the sheet's numbers. ⚠️
4. **Rate guardrail** — soft block with override. **Still to implement** (today it's a passive warning only). ⏳
5. **Cap VPRs per job** — no cap. ✅

**Only genuinely open build item from that list:** #4, the soft-block rate guardrail.

---

## The short version to send the owner

1. **New vendors** — new to the *recruiter*, or new to the *whole company*? (Your sheet's 5–7/week says per-recruiter.)
2. **Closures** — offer *accepted*, or candidate actually *joined*?
3. **Backouts** — any stage, or only after offer/joining?
4. **Interviews** — count when *scheduled with a date*, or as soon as a round is *logged*?
5. **Weeks** — calendar (1–7, 8–14…) or Monday-start?
6. Small ones: Bench roster shows **which Visa**? "Bench/W2" = C2C? Placement **"Organisation"** meaning + do you need **Date of Placement** separate from **Start Date**? Interview **Location** as its own field?

---

## Part D — Form-redesign deferred questions (built with a default; confirm when you get a chance)

Raised during the forms-discipline rollout (2026-07-12). Each was **built now with a sensible default**
so work isn't blocked — these just confirm/refine later.

### VPR (PR-1, shipped)
1. **"Vendor recruiter" semantics.** The field was redefined from *the vendor's own contact name* →
   *which of our users recruited this vendor* (now a searchable user dropdown, required, with inline
   "+ Add new user"). It still stores the user's **name string** (not an FK) for now, and prefills from
   the vendor's "Recruited by" owner. *Confirm:* is per-VPR the right place for this, and should it
   become a real FK / support **multiple** recruiters later? (Built: single, name-string.)
2. **New vendor → Vendors table.** You noted "if it's a new vendor it should be in the Vendors table in
   Settings." The VPR inherits its vendor from the parent Job, so there's no vendor picker on the VPR
   itself — new vendors are added on the Job form's quick-add. *Confirm* that's the intended flow.

### Candidates (PR-2)
3. **Tags** — kept as an optional free-text array. *What are tags meant to capture?* (Turn into a
   managed list if there's a fixed vocabulary.)
4. **Engagement type** — maps to the existing `workingType` (shown only when "Working now?" is set).
   *What values do you want, and is it distinct from C2C/W2?*
5. **Last contacted** — we keep the **date**. *Do you also want "contacted by whom"* (a new column)?

### Bench (PR-3)
6. **Project type / Call type / Payroll type** — required-but-free-text-fill for now (learn-as-you-type
   dropdowns). *Define the allowed values for each* and we'll convert them to fixed dropdowns.
