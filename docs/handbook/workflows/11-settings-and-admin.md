# Workflow 11 — Settings + Admin tools

> **In plain English.** Profile and password for everyone, and an
> "Admin tools" panel for admins to manage Clients, Vendors, Sources,
> their contact people, and recruiter accounts.

**Who uses it:** everyone (admin tools section is admin-only).

**Route:** `/settings`.

## Layout

- **Profile** — your name, email; a change-password form.
- **Admin tools** (admin only) — a panel with:
  - **Clients** — list with search, add/edit/deactivate, manage
    contacts (per-client contact rows).
  - **Vendors** — same shape as Clients.
  - **Sister company sources** — same.
  - **Recruiters** — link to `/recruiters` + an "Add recruiter"
    button.
  - **Audit log** — link to `/audit`.

## Every button + what it does

### Profile section

- **Change password** → `updateUserPassword` action. Validates the
  current password via `verifyPassword`, hashes the new one, writes
  the row.

### Org entity management (admin only)

- **Add client / vendor / source** → opens a `Dialog` (`src/components/
  ui/dialog.tsx`) with a form. Calls
  `createClient` / `createVendor` / `createSource`.
  Audit: no audit row today (org entities are infrastructure-y;
  could be added).
- **Edit / deactivate** — same dialog in edit mode. Deactivation
  flips `isActive = false`; the row stays in the DB.
- **Manage contacts** → opens `ContactsDialog`
  (`src/components/settings/contacts-dialog.tsx`). Lets you add /
  edit / delete `Contact` rows scoped to that org entity. `isPrimary`
  flag for the lead contact.

### Recruiter management (admin only)

- **Add recruiter** → form with name, email, password, role.
  Creates a `User` with `passwordHash`. Audit: no audit row.

## Validation

- All org entity names must be unique.
- Email + URL fields validated when set.
- See `src/lib/validation/org.ts`, `user.ts`.

## Code map

- Page: `src/app/(dashboard)/settings/page.tsx`.
- Sections:
  - `src/components/settings/user-section.tsx` — profile +
    password.
  - `src/components/settings/client-section.tsx` (and similar for
    vendor/source).
  - `src/components/settings/contact-org-section.tsx` — contact
    list.
  - `src/components/settings/contacts-dialog.tsx` — contact
    dialog.
  - `src/components/settings/settings-list-filter.tsx` — search
    box for long lists.
- Actions: `src/server/actions/org.ts` (clients/vendors/sources +
  contacts), `users.ts`.

## Why we built it this way

- **No dedicated `/admin` route.** Settings is the natural home
  for "things that touch your account," and admin tools fit
  alongside profile rather than in a parallel page.
- **Role-gated server-side.** The admin sections render only for
  ADMINs. Even if a recruiter typed in the action URL, the action
  itself rejects on role mismatch (`src/server/actions/org.ts`).
- **Contacts are per-entity.** A `Contact` belongs to exactly one
  Client / Vendor / Source. The CHECK constraint that enforces
  "exactly one parent" lives in the migration.
- **Soft delete only.** Deactivating an entity flips `isActive`.
  Historic jobs still link to it.
