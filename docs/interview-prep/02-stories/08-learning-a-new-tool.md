# Story 08 — Learning Next.js 16 and Prisma 7 cold

## Question this answers

- "Tell me about a time you learned a new technology fast."
- "How do you stay current?"
- "A time you didn't know what you were doing and figured it
  out."

## Situation

I started LuminTrack on the latest majors of Next.js (16) and
Prisma (7). Both had recent breaking changes that my Next.js 13
/ Prisma 5 muscle memory didn't cover. Some examples that bit me:

- Next 16 renamed middleware to "proxy" — `src/proxy.ts`, not
  `src/middleware.ts`.
- `cookies()`, `headers()`, `params`, `searchParams` are all
  async in Next 16. Forgetting an `await` silently returns a
  Promise.
- Prisma 7's runtime client requires a *driver adapter*. The
  classic engine no longer works out of the box.
- Connection URLs aren't in `schema.prisma` anymore — they live
  in `prisma.config.ts` (for the CLI) and `.env` (for the
  runtime via the adapter).

## Task

Get productive on the actual majors I'd shipped, not the older
ones my training memory defaulted to.

## Action

1. **Treated my prior knowledge as a hypothesis.** When something
   didn't work as expected, I checked the docs *before*
   re-googling old tutorials (which would point at v13/v5
   APIs).
2. **Read the docs locally.** `node_modules/next/dist/docs/` and
   the Prisma 7 release notes. Faster than the web.
3. **Built a tiny throwaway first.** A 4-file Next 16 + Prisma 7
   demo wiring auth and a list page. Threw it away after I knew
   each surface.
4. **Wrote down gotchas as I hit them.** Lives now in
   `docs/handbook/99-faq-gotchas.md`. Examples:
   - Decimal flatten before crossing the RSC boundary.
   - `pg_try_advisory_xact_lock` reusable for serialised jobs.
   - Render-then-hydrate pattern for localStorage-driven UI.
   - `suppressHydrationWarning` for password-manager-injected
     attributes.
5. **Added a guardrail.** A short `AGENTS.md` at the repo root
   reminding future-me (and any helper) that this is *not* the
   Next.js you know — APIs may differ from training data, read
   the local docs before assuming.

## Result

- Shipped all 7 phases of the app on Next 16 + Prisma 7 in
  ~4 weeks of evenings.
- Wrote the gotchas page so the next person doesn't re-discover
  them.
- I now treat "latest major" as a deliberate choice — fine when
  you're willing to invest in the learning, costly when you're
  rushing.

## Variant phrasings

- **"A time you read source code or docs deeply":** Reading
  Next's local `docs/` rather than blog posts paid for itself in
  hours saved.
- **"A time you documented for your future self":** The
  `99-faq-gotchas.md` is literally that.
- **"A time you avoided a hidden risk":** Adding `AGENTS.md`
  ahead of the project growing — telling collaborators upfront
  that the stack is bleeding edge.

## Honest caveats

- I didn't catch *every* breaking change. The Turbopack cache
  corruption ("Cannot find module '../chunks/ssr/[turbopack]_runtime.js'")
  happened twice before I added the `rm -rf .next` fix to the
  gotchas page.
- Some choices (e.g. bcryptjs over native bcrypt) were
  conservative — I could've benchmarked instead of choosing on
  "this will work in Edge."
