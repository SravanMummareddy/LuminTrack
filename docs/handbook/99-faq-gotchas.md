# 99 — FAQ + gotchas

The things that bit us at least once. If you're debugging something
weird, scan this list first.

## Next.js 16

### "My `params` / `searchParams` is `undefined`"
They're **async now**. Always `await` them:

```ts
export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
}
```

### "There is no middleware.ts in this project"
Middleware was renamed to **proxy** in Next 16. The file is
`src/proxy.ts` and it exports a `proxy` function.

### "Turbopack throws `Cannot find module '../chunks/ssr/[turbopack]_runtime.js'`"
Cache corruption. Fix:
```
rm -rf .next && npm run dev
```

### "Hydration mismatch on text that depends on localStorage"
Examples: "Showing X of Y columns" when we don't know the user's
saved column prefs yet on the server.
Fix: `suppressHydrationWarning` on the element. See
`src/components/{jobs,candidates,submissions}-table.tsx`.

### "Hydration mismatch on a form input"
Password-manager extensions (NordPass, LastPass, 1Password, Norton)
inject `data-np-*` / `data-lastpass-*` attributes before React
hydrates. The shared `<Input>`, `<Textarea>`, `<Select>` in
`src/components/ui/field.tsx` set `suppressHydrationWarning`
specifically for this.

## Prisma 7

### "Prisma client won't initialise"
Prisma 7 requires a **driver adapter**. See `src/server/db.ts` — we
use `@prisma/adapter-neon`. Without it, `new PrismaClient()` throws.

### "Migrations work locally, fail in CI" (or vice versa)
Two URLs:
- `DATABASE_URL` (in `.env`) — used by the running app via the Neon
  adapter.
- `DIRECT_URL` (in `.env` *and* read by `prisma.config.ts`) — used
  by the Prisma CLI.

The connection URL is **not** in `schema.prisma`. It's in
`prisma.config.ts`.

### "Import from `@prisma/client` not found"
Import from `@/generated/prisma/client` instead — the generator
outputs into `src/generated/prisma/`. Configured in
`schema.prisma`'s `generator` block.

### "Decimal field crashed my client component"
Prisma `Decimal` is not serialisable across the Server → Client
boundary. Flatten it in the query before passing it to a Client
Component:

```ts
return rows.map(r => ({
  ...r,
  vendorRate: r.vendorRate?.toString() ?? null,
  candidateRate: r.candidateRate?.toString() ?? null,
}));
```

We've hit this on the candidates / submissions list queries —
flattening was added there.

## React 19

### "Each child in a list should have a unique key prop"
Inside the `Table` component we wrap children in
`Children.toArray(children)` to auto-key keyless multi-children
(`<thead>` + `<tbody>` together). See `src/components/ui/table.tsx`.

### "form action server function complains about something"
The action must:
1. File starts with `"use server";`.
2. Signature `(_prev: FormState, formData: FormData) => Promise<FormState>`.
3. Return a `FormState` (or `redirect()` after success).

### "useActionState returns stale state after redirect"
The redirect resets the page; no stale state to worry about. If
you're seeing a stale render, you're probably rendering between the
action call and the redirect — let it complete.

## Tailwind v4

### "Where's tailwind.config.js?"
Doesn't exist. v4 config is CSS-driven:
```css
/* src/app/globals.css */
@import "tailwindcss";
@theme {
  /* tokens here */
}
```

### "@apply doesn't work"
v4 supports it but limits it to certain contexts. We avoid `@apply`
entirely and compose classes via `cn(...)`.

## Recharts

### "ResponsiveContainer logs width(-1) height(-1)"
The container's parent is a flex child without `min-width: 0`, so
the initial measurement is negative.
Fix in `src/components/dashboard/charts.tsx`:
```tsx
<div style={{ width: "100%", height, minWidth: 0 }}>
  <ResponsiveContainer width="100%" height="100%">
```

## Auth

### "Cookie is set but the user still gets bounced to /login"
- Check that `User.isActive` is `true`. `getCurrentUser` re-checks
  this on every render.
- Confirm `AUTH_SECRET` is set in `.env` (the JWT can't be signed
  or verified without it).
- In prod, the cookie is `secure`, so non-HTTPS requests won't send
  it. Local dev uses HTTP and is fine.

### "Rate limit didn't reset after I successfully logged in"
The bucket is in-memory, process-local. If you're hitting different
serverless instances (Vercel Fluid Compute), each one has its own
counter. For the team's scale this is fine — the limit is forgiving.

## Display IDs

### "I want to delete and recreate a job — does it keep the same ID?"
No. `seq` is a Postgres sequence; new inserts get the next value.
This is why we don't hard-delete primary entities (statuses serve
the "retire" function).

### "Why does an iLabor job show REQ-… instead of JOB-…?"
`formatJobDisplayId(job)` prefers `portalRefId` when set. iLabor's
own ID is the more useful one for portal-imported jobs.

## iLabor import

### "Status didn't update for an existing job"
By design. The importer preserves LuminTrack's status to honour
hand-edits. The preview shows a "status diverged" warning when the
two disagree.

### "Another import is in progress"
The advisory lock is held. Wait for the first one to finish
(usually seconds). If it's stuck, restart the dev server — the
lock auto-releases when the transaction ends.

## General

### "Where do filters live?"
URL params. There is no client-side filter state. `src/lib/filters.ts`
+ `src/lib/analytics.ts` parse them on the server.

### "Why does the same page have multiple paginators?"
Each sub-table on a detail page is independently paginated.
Namespaced query params (`?subs=`, `?ints=`, `?jobs=`, `?rsubs=`,
`?rstatus=`) so they don't stomp each other.

### "I added a new schema column but the form doesn't see it"
Six places to update (see [`06-conventions.md`](./06-conventions.md)):
1. `prisma/schema.prisma`
2. `npm run db:migrate`
3. `src/lib/validation/<resource>.ts`
4. `src/components/.../<resource>-form.tsx`
5. `src/server/actions/<resource>.ts`
6. `src/server/queries/<resource>.ts` (if the list needs it)

### "Where do I add a new audit action enum value?"
1. Add it to `enum ActivityAction` in `prisma/schema.prisma`.
2. Write a migration: `npm run db:migrate`.
3. Pass it to `logActivity({ action: "NEW_ACTION", … })` from your
   Server Action.

### "How do I deploy?"
Push to main. Vercel auto-builds. Make sure the environment
variables (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
`BLOB_READ_WRITE_TOKEN` when used) are set in the Vercel dashboard.
