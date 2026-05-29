# Workflow 01 — Sign in and navigation

> **In plain English.** How you get into LuminTrack, and how you
> move around once you're in. The login screen, the topbar, the
> sidebar, the mobile menu, the global search, and the user-menu
> dropdown.

**Who uses it:** everyone.

## Sign in

**Route:** `/login` (the only public route).

**Screen:** centered card with email + password inputs, "Sign in"
button, and a small "LuminTrack" wordmark. No "forgot password" link
(by design — admins reset directly).

**Every button + what it does**

- **Sign in** → `loginAction` (Server Action). Validates with the
  `loginSchema` Zod schema, rate-limits 5/15 min per email+IP, checks
  bcrypt, sets the `lumintrack_session` cookie, redirects to `/`.

**Error states**

- Invalid email format → inline field error.
- Wrong credentials → "Invalid email or password." (deliberately
  generic — see [`../05-auth-and-sessions.md`](../05-auth-and-sessions.md)).
- Too many attempts → "Too many login attempts. Try again in N minutes."

**Code map**

- Page: `src/app/(auth)/login/page.tsx`.
- Form: inline on the page (no separate component — it's small).
- Action: `loginAction` in `src/server/actions/auth.ts`.
- Schema: `loginSchema` in `src/lib/validation/auth.ts`.

## The shell (topbar + sidebar)

Once signed in, every authenticated route renders inside
`src/app/(dashboard)/layout.tsx` which composes:

- **Topbar** (`src/components/layout/topbar.tsx`) — top of the page.
- **Sidebar** (`src/components/layout/sidebar.tsx`) — left rail on
  `md+`.
- **MobileNav** (`src/components/layout/mobile-nav.tsx`) — hamburger
  drawer on `<md`.

### Topbar contents (left → right)

1. **Mobile menu button** (`<md` only) — opens MobileNav drawer.
2. **Global search** (`src/components/search/global-search.tsx`) —
   combobox over Jobs / Candidates / Submissions. Full doc:
   [`13-global-search.md`](./13-global-search.md).
3. **Recently viewed dropdown**
   (`src/components/layout/recently-viewed.tsx`) — last 10 detail
   pages you visited; stored in localStorage.
4. **Name + role** (visible at `sm+`) — your full name and "Administrator" /
   "Recruiter".
5. **User menu** (`src/components/layout/user-menu.tsx`) — avatar
   circle. Click opens a small dropdown with:
   - Your name and email.
   - "Settings" link → `/settings`.
   - "Sign out" → `<form action={logoutAction}>`.

The user-menu uses an outside-click handler + Escape key to close,
and `aria-haspopup`/`aria-expanded` for screen readers.

### Sidebar links

The full nav list lives in `src/components/layout/nav-links.tsx`.
Today:

- Dashboard (`/`)
- Jobs (`/jobs`)
- Candidates (`/candidates`)
- Submissions (`/submissions`)
- Recruiters (`/recruiters`)
- Reports (`/reports`)
- Audit (`/audit`) — admin only
- Settings (`/settings`)

Active link is highlighted by matching `pathname`.

### MobileNav

A slide-in drawer triggered by the hamburger. Mirrors the sidebar
links. Uses `useFocusTrap` to trap Tab inside the drawer and close
on Escape. Body scroll is locked while open.

## Error and not-found pages

- `src/app/(dashboard)/error.tsx` — runtime error fallback for any
  authenticated route. Shows a friendly card + a "Retry" button that
  calls `reset()`.
- `src/app/(dashboard)/not-found.tsx` — 404 inside the dashboard.
- Top-level `src/app/not-found.tsx` covers pre-login 404s.

## Why no breadcrumbs?

Detail pages each have a back-link in their page header
(`PageHeader` component). The hierarchy is shallow enough — Job →
Submission → Round — that breadcrumbs would be visual noise.

## Recently viewed — implementation note

Saved in `localStorage` under a single key. Each detail page calls a
small helper (`src/lib/analytics.ts`) on mount to push its
`{ type, id, title }` to the front, dedupe, cap at 10.

This isn't analytics in the BI sense — it's purely the
"recently-viewed" affordance. Telemetry, if/when we add it, would go
to a separate file.
