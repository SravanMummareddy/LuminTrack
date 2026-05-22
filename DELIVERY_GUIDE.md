# LuminTrack — Client Delivery Guide

_Last updated: 2026-05-22_

How to hand LuminTrack to a client, what they will ask, and the technical
options behind each decision.

**Delivery model assumed in this doc:** Lumin Innovations **hosts and operates**
the app as a managed service for a **non-technical recruiting client** (no IT
staff). The client logs in and uses the app; Lumin owns the infrastructure,
deployments, and support.

---

## 1. Delivering it WITHOUT giving the client the code

The client gets a **running app at a URL** — never the source code. Three ways
to deploy, none of which expose code to the client:

| Approach | How it works | Client sees code? |
|---|---|---|
| **Private GitHub repo + Vercel** _(recommended)_ | Repo lives in Lumin's private GitHub org. Vercel auto-deploys on push. Client has no GitHub access. | No |
| **Vercel CLI deploy** | No GitHub at all. From your machine: `npm i -g vercel` → `vercel link` → `vercel --prod`. Deploys straight from local. | No |
| **Self-hosted build** | You build and run it on a server (see §10). | No |

**Recommended: private repo + Vercel.** You keep version history and easy
rollbacks; the client never touches code. Use Vercel CLI only if you want zero
GitHub involvement.

> **Note:** With Vercel or any cloud platform, Vercel's build servers receive
> your source to compile it — that is intrinsic to the platform, not a leak to
> the client. If the client contractually requires that *no third party ever
> touches the code*, that points to self-hosting (§10).

**What "delivery" actually means here:** the client receives a URL + an admin
login + training — not a zip of code. Code ownership and IP stay with Lumin
unless the contract says otherwise.

---

## 2. Pre-delivery readiness checklist

Do these before the client touches it:

- [ ] **Triage `bugs.md` (8 open items)** — status filter in settings,
      client/vendor contacts, manual job source ("Others"), rename "sister
      company source" → "source", candidate active/inactive, editable submitted
      date, default date-time in status form, interview-mode dropdown. Decide
      launch-blockers vs. fast-follow.
- [ ] **Fresh production database** — a new Neon DB, separate from dev. Never
      point prod at the dev database.
- [ ] **⚠️ Guard `prisma/seed-demo.ts`** — it **wipes the entire database**.
      Once real client data exists this must never run against prod. Add a guard
      that refuses to run when `NODE_ENV=production`.
- [ ] **Password reset path** — auth is hand-rolled. A non-technical client
      *will* lock themselves out. Confirm an admin can reset any user's
      password. If not, this is a launch-blocker.
- [ ] **Strong secrets** — new `AUTH_SECRET`, a real admin password (not the
      demo `LuminTrack2026!`), real recruiter accounts, demo accounts removed.
- [ ] **Production build passes clean** — `npm run build`.
- [ ] **Remove demo data** — `seed-demo` content must not ship to the client.

---

## 3. Hosting setup (Lumin-operated)

Everything stays under **Lumin's accounts**:

- **App → Vercel** (Lumin account). Pro plan (~$20/mo) for a real client.
- **Database → Neon** (Lumin account). **Pick a region close to the client** —
  affects speed and data-residency answers.
- **Env vars** live in the Vercel dashboard: `DATABASE_URL`, `DIRECT_URL`,
  `AUTH_SECRET` — never in code.
- **Estimated infra cost: ~$20–40/month.** Fold this into client pricing.

---

## 4. Wiring a domain the client already owns

The client does **not** need to transfer or move their domain. You only add DNS
records.

**Steps:**
1. In Vercel → Project → Settings → **Domains**, add the domain.
2. Vercel shows the DNS records to create:
   - **Subdomain** (e.g. `recruiting.theircompany.com`): one **CNAME** record
     → `cname.vercel-dns.com`.
   - **Root/apex** (e.g. `theircompany.com`): an **A** record → Vercel's IP, or
     point nameservers to Vercel.
3. The records get added at the client's domain registrar (GoDaddy, Namecheap,
   etc.). Either the client adds them, or they grant you DNS access.
4. Vercel auto-provisions the HTTPS certificate.

> **Strongly recommend a subdomain** (`recruiting.theircompany.com`). It leaves
> their existing website and company email completely untouched — zero risk to
> their main domain. A root-domain setup risks their live website if records
> are misconfigured.

---

## 5. SSO with company emails

The client has company email accounts and asks about single sign-on.

**First, find out what they run:** "company email" is almost always **Google
Workspace** or **Microsoft 365**. The answer determines the integration.

**The app's auth is hand-rolled** (bcrypt + JWT cookie, not NextAuth), so SSO is
a **development task**, not a config switch. Options, cheapest to most involved:

| Option | What it gives | Effort |
|---|---|---|
| **Domain-restricted accounts** | Only `@theircompany.com` emails can be created / log in. Login UX unchanged. | Low |
| **"Sign in with Google"** (Google Workspace) | One-click login with their Google account; restrict to their domain. | Medium |
| **"Sign in with Microsoft"** (Microsoft 365 / Entra ID) | Same, for Microsoft shops. | Medium |
| **Full SAML SSO** | Enterprise SSO. Overkill for <10 users. | High |

**Recommendation:** for a <10-recruiter team, full SAML is not worth it. If
they're on Google Workspace, **"Sign in with Google" restricted to their
domain** is the sweet spot. If budget is tight, **domain-restricted accounts**
covers most of the security concern at low cost. Either way, scope and price it
as a paid feature — it is real work.

---

## 6. Google Drive résumés — org-only access

Résumés are **Google Drive links**, shown as an inline preview. The app converts
the share URL to a Drive `/preview` URL embedded in an `<iframe>`
(`src/lib/resume.ts`).

**Does an org-restricted file still display in the preview?**

The iframe loads inside the **viewer's browser, using the viewer's Google
session**. So:

- ✅ **It displays** if the recruiter viewing the résumé is **signed into their
  organization's Google account** in that browser, and the file is shared with
  the org.
- ❌ **It shows "You need access" / blank** if they're not signed in, or signed
  into a different (personal) Google account.

**Recommended sharing setting:** if the whole recruiting team is on the client's
Google Workspace, share résumés as **"Anyone in [Organization] with the link"**.
This is far more secure than "Anyone with the link" (which exposes candidate
résumés — personal data — to anyone who obtains a URL), and previews still work
for signed-in org members.

> **Gotcha — multiple Google accounts:** if a recruiter is signed into several
> Google accounts in one browser, the embedded iframe uses the *default*
> account and may show an access error even when they do have access. Fix: use
> a browser profile signed into **only** the org account. Worth mentioning in
> training.

---

## 7. Exporting data

There is **currently no built-in export feature**. Two paths:

1. **Build CSV / Excel export buttons** _(recommended near-term feature)_ — an
   "Export" button on each list (jobs, candidates, submissions). Lets the
   non-technical client self-serve, and directly answers their "can we get our
   data out?" question. This is a scoped feature.
2. **Ad-hoc / full export by Lumin** — Lumin runs `pg_dump` against the Neon
   database for a complete copy, or exports individual tables to CSV from the
   Neon console. Use this for a full handover or a contract-exit data dump.

**For the contract:** commit to providing a full data export (CSV per table or
a SQL dump) on request and on termination. The client owns their data.

---

## 8. Weekly updates, progress, and snapshots

"Weekly updates" can mean three different things — here's how to handle each:

### A. Development progress (what you built this week)
- Keep a **staging environment**: a separate Vercel deployment URL where
  in-progress changes go first. The client previews there; you promote to
  production when approved.
- Send a short **weekly changelog** (email or a shared doc) — "this week:
  fixed X, added Y."

### B. Data snapshots / backups
- **Neon point-in-time restore** already keeps the database recoverable —
  confirm the retention window on your plan.
- For explicit weekly copies: a scheduled **`pg_dump`** saved to storage
  (Google Drive, S3), or a **Neon branch** created weekly as a frozen snapshot.
- Can be automated with a **Vercel Cron** job.

### C. Recurring reports / analytics for the client
- The app already has a **Reports page** (charts, recruiter performance).
- A **weekly summary emailed automatically** would need an email provider
  (e.g. Resend or Postmark) plus a scheduled job (Vercel Cron). This is a
  feature to scope and price.

**Recommendation:** staging URL for progress visibility, Neon PITR + a periodic
`pg_dump` for snapshots, and offer the automated weekly report email as an
optional paid add-on.

---

## 9. How data is stored & kept safe

So you can answer the client confidently:

- **Database:** PostgreSQL, managed by **Neon** (runs on AWS). Holds all
  recruitment data — jobs, candidates, submissions, interview rounds, notes,
  and the audit timeline.
- **Résumés:** *not* stored in the app — they are Google Drive links (see §6).
- **Encryption:** in transit (HTTPS everywhere) and at rest (Neon encrypts
  storage) — both automatic.
- **Backups:** Neon point-in-time restore. Confirm and quote the real retention
  window to the client ("we can restore to any point in the last N days").
- **Access control:** per-user logins; admin vs. recruiter roles; an audit log
  records who changed what and when — lead with this, it's a selling point.

---

## 10. If the client doesn't want Vercel / Neon

Reasons vary: cost, data residency, a corporate cloud standard, or "we want it
on our own infrastructure." Options:

### App hosting alternatives (instead of Vercel)
- **Netlify** — closest equivalent, supports Next.js.
- **Railway / Render** — run the Next.js app as a Node service.
- **AWS** (Amplify or ECS), **Azure App Service**, **Google Cloud Run** — if the
  client mandates a specific cloud.
- **Self-hosted VPS** — Next.js runs as a standalone Node server in a Docker
  container on any VPS (DigitalOcean, Hetzner) or the client's own server.

### Database alternatives (instead of Neon)
- Any PostgreSQL works: **Supabase**, **Railway Postgres**, **AWS RDS**,
  **Azure Database for PostgreSQL**, **Google Cloud SQL**, or self-managed
  Postgres on a VPS.

> **⚠️ Code-change gotcha:** Prisma 7 currently uses the **Neon driver adapter**
> (`@prisma/adapter-neon` in `src/server/db.ts`). Moving off Neon to plain
> PostgreSQL requires swapping to a different adapter (`@prisma/adapter-pg`).
> This is a small but real code change — not just an env-var swap.

### Self-host everything
- A **Docker Compose** stack (Next.js app + PostgreSQL) on a single VPS or the
  client's server. Maximum control and data ownership; maximum ops burden
  (updates, backups, monitoring, security patching all become someone's job).

### Trade-off

| | Managed (Vercel + Neon) | Self-hosted |
|---|---|---|
| Ops effort | Lowest | High (ongoing) |
| Cost shape | Recurring SaaS fees | Possibly cheaper infra, more labor |
| Data location | Neon's region (you choose) | Wherever you/they put it |
| Best for | This managed-service model | Client demanding data on own infra |

> If the client insists on hosting on **their own infrastructure**, the
> engagement shifts from "managed service" toward "handover" — re-confirm who
> owns ongoing operations and support before agreeing.

---

## 11. Questions the client will likely ask

| Question | Your answer |
|---|---|
| Is our data safe and private? | Encrypted in transit and at rest; isolated database; per-user logins; full audit trail. |
| What if the site goes down? | Vercel/Neon are enterprise infrastructure; Lumin monitors and responds. |
| Can we get our data out if we leave? | **Yes** — CSV/Excel export (planned) or a full database dump on request. In the contract. |
| Who can see candidate data? | Only the client's logged-in users — plus Lumin as the operator (be honest). |
| Data protection rules? | Candidate résumés/details are personal data — have a basic data-handling answer ready for the client's region. |
| Can recruiters use phones? | Yes — installable PWA, mobile-responsive. |
| What if a recruiter leaves? | Admin retires/disables the account; their history stays in the audit log. |
| Can we use our own domain? | Yes — see §4. |
| Can we use company-email login / SSO? | Yes, as a scoped paid feature — see §5. |
| What if Lumin disappears? | Data-export clause in the contract protects them. |
| Can you add features? | Yes — define included support vs. paid change requests. |

---

## 12. Commercial / contract basics

- **Pricing model** — e.g. one-time setup fee + monthly fee (hosting +
  support). Per-seat is simple to explain for a <10-recruiter team.
- **Support scope** — bug fixes and uptime included; new features quoted
  separately. Pin this down or scope creep will erode margin.
- **Uptime / support response** — at this scale, "best effort, response within
  N business hours" is sufficient.
- **Data ownership** — state plainly: the client owns their data; Lumin only
  hosts it.
- **Exit clause** — on termination, Lumin exports the client's data and hands
  it over.
- **IP / code ownership** — clarify that the application code remains Lumin's
  unless explicitly sold.

---

## 13. Handover & training

The client receives a *running app*, not a codebase:

- The live URL + their admin account credentials.
- A **plain-English user guide** — repurpose `DEMO_GUIDE.md` into a
  non-technical manual.
- A **live training session** — walk the admin through users, jobs, candidates,
  submissions, interview rounds, reports.
- A **support contact** — email or WhatsApp; set response expectations.

---

## 14. Ongoing operations (Lumin's side, after launch)

- Uptime monitoring + alerts.
- Verify backups actually restore (don't assume).
- Track infra cost vs. what you bill.
- Apply dependency and security updates.
- Onboard new client users as the team grows.

---

## 15. Recommended next steps

1. Triage `bugs.md` into launch-blockers vs. fast-follow.
2. Add the `seed-demo` production guard; confirm the password-reset path.
3. Build CSV/Excel export (covers the "get our data out" question + §7).
4. Decide and scope SSO (§5) — confirm Google Workspace vs. Microsoft 365.
5. Set up a staging environment for client progress reviews (§8A).
6. Turn `DEMO_GUIDE.md` into a client-facing user manual.
7. Draft the service agreement (§12).
