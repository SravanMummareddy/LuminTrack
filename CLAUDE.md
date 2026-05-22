@AGENTS.md

# LuminTrack

Internal recruitment tracking dashboard for a small recruiting team (<10 recruiters).
Tracks job requirements, candidate submissions, interview rounds, outcomes, notes, an audit
timeline, and recruiter performance. Replaces a manual Excel/Word process.

**Source of truth for requirements:** `docs/PROJECT_REQUIREMENTS.md`
**Approved build plan:** `~/.claude/plans/we-have-the-requirements-optimized-balloon.md`

## Stack (all current majors — verify APIs, don't assume older versions)

- **Next.js 16** (App Router, Turbopack) + React 19.2 + TypeScript
- **Prisma 7** + PostgreSQL on **Neon** (driver adapter `@prisma/adapter-neon`)
- **Tailwind CSS v4** — hand-rolled UI primitives in `src/components/ui/` (shadcn/ui not used)
- **Zod 4** validation, react-hook-form
- Auth: hand-rolled session (`bcryptjs` + `jose` JWT cookie) — NOT NextAuth
- Resumes = Google Drive links with inline preview (Phase 3); `@vercel/blob` file upload
  deferred until a Blob store is provisioned. Recharts for charts (Phase 7)
- Deploy target: Vercel

## Critical version gotchas

**Next.js 16**
- Middleware is renamed `proxy` — the file is `src/proxy.ts`, exports a `proxy` function.
- `cookies()`, `headers()`, `params`, `searchParams` are ALL async — always `await` them.
- Turbopack is the default for `next dev` / `next build` (no flag needed).
- `revalidateTag` needs a second `cacheLife` arg; prefer `revalidatePath` / `refresh`.

**Prisma 7**
- The runtime client REQUIRES a driver adapter — see `src/server/db.ts` (Neon adapter).
- Connection URLs are NOT in `schema.prisma`; they live in `prisma.config.ts`
  (`datasource.url` = `DIRECT_URL` for the CLI) and `.env` (`DATABASE_URL` for the app).
- Generated client lives at `src/generated/prisma/` (gitignored) — import from
  `@/generated/prisma/client`. Run `prisma generate` after schema changes (also `postinstall`).

## Conventions

- **Mutations** = Server Actions in `src/server/actions/*`. **Reads** for Server Components
  go in `src/server/queries/*`. Pages are async Server Components.
- **DB client**: import the singleton `prisma` from `@/server/db`.
- **Audit log**: every mutating action runs its write + `logActivity()` (`src/server/activity.ts`)
  inside one `prisma.$transaction` so the change and its audit row commit atomically.
- **Validation**: Zod schemas in `src/lib/validation/*`, shared by client form + server action.
- **Auth**: `getCurrentUser()` / `requireUser()` from `@/lib/session` for the acting user.
- No hard-deletes of jobs/candidates — retire via status; org entities via `isActive`.

## Commands

```
npm run dev         # dev server (Turbopack)
npm run build       # production build
npm run db:migrate  # prisma migrate dev
npm run db:seed     # seed admin + sample data (prisma/seed.ts)
npm run db:studio   # prisma studio
```

## Environment (.env — gitignored; see .env.example)

`DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon direct), `AUTH_SECRET`,
`BLOB_READ_WRITE_TOKEN` (Phase 3), `SEED_ADMIN_*`.

## Build phases (delivery: check-in after each)

- **Phase 1 — Foundation & Auth** ✅ done & verified (migration applied, seeded, login works)
- **Phase 2 — Jobs & org entities** ✅ done & verified (Settings CRUD, job CRUD + filters, job detail)
- **Phase 3 — Candidates** ← NEXT (CRUD, Drive-link resume + inline preview, duplicate warning)
- Phase 4 — Submissions (pipeline, duplicate prevention)
- Phase 5 — Interview rounds
- Phase 6 — Timeline / audit UI + Notes
- Phase 7 — Dashboard & Reports
