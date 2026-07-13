# LuminTrack — Pilot Runbook

For the 1-week real-data pilot with real recruiters. Covers pre-flight, day-one
onboarding, honest capability answers, and the recovery story. Verified against
the code + a read-only prod DB check on 2026-07-13.

---

## A. Pre-flight (owner, before recruiters log in)

### A1. Confirm prod env vars (Vercel → Project → Settings → Environment Variables)
| Var | Why it matters |
|-----|----------------|
| `DATABASE_URL` | **Hard required** — app throws on boot without it. (Already set; app is live.) |
| `AUTH_SECRET` | **Hard required** — login + every authed request break without it. (Already set.) |
| `BLOB_READ_WRITE_TOKEN` | **Required for résumé/document uploads AND the nightly backup.** Auto-injected when a Blob store is linked to the project — confirm the store is linked. |
| `CRON_SECRET` | Gates the nightly backup + purge crons. Without it, **backups silently never run.** Set it. |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional — left **unset for the pilot** (email runs dark; all sends no-op safely). |

### A2. Back up, then clean the demo data out of prod
Prod currently holds **demo data** (50 fake jobs, 30 candidates, 160 submissions, 12
`@lumintrack.com` users). Real recruiters must start on a clean slate.

1. **Back up first** (so the demo set is recoverable): trigger `/api/cron/backup` once, or run
   the backup script — it writes a gzipped full-DB snapshot to Blob.
2. **Run the clean-slate provisioner** (wipes everything → one org, its roles, one admin login):
   ```sh
   set -a; . ./.env.neon-prod.bak; set +a
   SEED_ADMIN_EMAIL=you@company.com \
   SEED_ADMIN_PASSWORD='a-strong-password-10+chars' \
   SEED_ADMIN_NAME='Your Name' \
   CONFIRM_CLEAN=yes \
   npx tsx prisma/seed-prod-clean.ts
   ```
   It prints the target DB host first and refuses to run without `CONFIRM_CLEAN=yes` and a real
   (≥10-char) admin password — so it can't wipe the wrong DB or leave a weak prod admin.
3. **Verify**: log in as the new admin; the dashboard + all lists should be empty.

> Migrations are already in sync on prod (73 applied, latest `…_requirement_recruiter_emailed`) —
> no `migrate deploy` needed unless you ship a new migration.

---

## B. Day-one onboarding (admin, in the app)

1. **Log in** as the admin created in A2.
2. **Create a team** first: Settings → Teams → add a team, and set its **Team lead**. Do this
   before adding submissions — the "Team lead" picker on the submission/VPR forms is populated
   only from users who lead a team, so with no team lead set, recruiters must mark that field N/A.
3. **Add each recruiter**: Settings → Users → Add user — name, email, **role** (Recruiter), **team**,
   and a **password**. Password policy: ≥10 chars, 3 of 4 character classes.
4. **Hand out credentials out-of-band** (Slack/in person). There is **no automated welcome email
   and no self-serve "forgot password"** yet — if a recruiter forgets their password, an admin
   re-sets it in Settings → Users (edit → New password) and relays it. (Self-service change under
   the user's own profile requires knowing the current password.)

That's the whole onboarding loop — it works today; the only manual part is distributing passwords.

---

## C. Capability answers (for "what can we do next?")

Honest scope — what's easy, what's a project, what not to promise.

- **Custom domain** (e.g. `track.yourcompany.com`) — ✅ **Easy, no code, ~15–30 min.** Add the
  domain in Vercel → Settings → Domains; it gives you a CNAME (or A) record; add it at GoDaddy;
  Vercel auto-provisions TLS. Do this any time.
- **Hosting / database — stay on Neon.** We're on Neon Postgres now and it's the live prod DB.
  Supabase is also Postgres; migrating is *possible* but buys nothing for the pilot and adds risk —
  its draw is bundled auth + storage, which we've already built (hand-rolled auth + Vercel Blob).
  Revisit only if a specific Supabase feature is wanted later; it's a deliberate project, not a
  quick swap.
- **Google sign-in (SSO)** — ❌ **Not built.** It's a real, focused piece of work (an OAuth provider
  on top of the hand-rolled session), best done **post-pilot**. For the pilot, admin-created
  accounts + passwords is the login story. Don't promise SSO for week 1.
- **Real email** (digest + assignment notifications) — the infra is **built and shipped**, just
  unconfigured. Turn-on = a Resend account + a verified sending domain (a few DNS records) +
  `RESEND_API_KEY`/`EMAIL_FROM` in Vercel (~1 hr incl. DNS). Flip it on whenever wanted.

---

## D. Recovery story (if a recruiter deletes something)

- **Deletes are soft, with a 30-day window.** Candidates/jobs go Active → Inactive → Trash (30d) →
  Erased; résumés archive rather than hard-delete when referenced. Nothing a recruiter does during
  the week is permanently lost.
- **Nightly full-DB backup** to Blob at 02:00 UTC (needs `BLOB_READ_WRITE_TOKEN` + `CRON_SECRET`),
  with a documented restore path (`prisma/restore-from-backup.ts`).
- The purge cron only permanently erases things soft-deleted **≥ 30 days ago**, and runs *after* the
  nightly backup — so fresh pilot data is never touched.

---

## E. Known caveats to accept for week 1 (documented, not blockers)

- No forgot-password / no forced first-login password change — admin manages passwords manually.
  Fine at 10 users; worth building if the pilot lands.
- Email runs dark (by choice) — no digest/assignment emails go out this week.
- If a résumé upload fails (e.g. a transient Blob hiccup), the recruiter now sees a friendly
  "Upload failed — please try again" instead of an error page (fixed 2026-07-13); they retry.
