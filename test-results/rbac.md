# LuminTrack RBAC / Server-Side Authorization Audit

**Scope:** Verify recruiter-forbidden actions are BLOCKED SERVER-SIDE (at the
Server Action / Route Handler trust boundary), not merely hidden in the UI.
**Date:** 2026-07-06 · Branch: `feature/feedback-round-1`

## Auth foundation (verified)

- `getCurrentUser()` — `src/lib/session.ts:33` — reads the signed session cookie,
  verifies the JWT, loads the user, and returns `null` if the user is missing or
  `!isActive`. Request-memoized.
- `requireUser()` — `src/lib/session.ts:47` — redirects to `/api/auth/logout` when
  unauthenticated. Used by every Server Action reviewed.
- Permission helpers — `src/lib/permissions.ts`:
  - `canViewSensitiveDocs` / `canManageSensitiveDocs` = `role === "ADMIN"` (lines 28, 32)
  - `canViewBenchCredentials` = `role === "ADMIN"` (line 40)
  - `canManageRequirements` = `role === "ADMIN" || isTeamLead === true` (line 49)

---

## Findings

### 1. Org-entity create/edit (Clients, Vendors, Sister-company Sources)
- **Expected:** Admin-only.
- **Guard:** `src/server/actions/org.ts:25` — shared `requireAdmin()` (`actor.role !== "ADMIN"`)
  called at the top of `saveSisterCompany` (:36), `saveVendor` (:69), `saveClient` (:102).
- **Verdict:** ENFORCED · **Severity:** —

### 2. Vendor Requirement (VPR) management — create / edit / cancel / close / convert
- **Expected:** `canManageRequirements` (admin or team lead) for management;
  convert is recruiter-accessible by design.
- **Guard:** `src/server/actions/requirements.ts`
  - `createVendorRequirement` :45 · `updateVendorRequirement` :111 · `cancelVendorRequirement` :174 ·
    `closeVendorRequirement` :208 — all re-check `canManageRequirements(user)` at the top.
  - `convertRequirementToSubmission` :251 — intentionally NOT gated to managers (recruiters
    convert). It reuses `createSubmissionRecord`, which self-claims the job for non-admins,
    and enforces OPEN-status + block gates. Correct by design.
- **Verdict:** ENFORCED · **Severity:** —

### 3. Settings / data export
- **Expected:** Full JSON = admin-only; Excel business/full route protected.
- **Guard:**
  - `src/app/api/export/full/route.ts:10-11` — `!user` → 401, `role !== "ADMIN"` → 403.
  - `src/app/api/export/excel/route.ts:20-22` — `!user` → 401, `role !== "ADMIN"` → 403
    (BOTH modes require admin at the route; the mode toggle is validated but does not relax auth).
  - Page guard `src/app/(dashboard)/settings/export/page.tsx:10-12` — `Forbidden` for non-admin
    (defense in depth; the route handlers are the real boundary and are guarded).
- **Verdict:** ENFORCED · **Severity:** —
- **Note (informational, not a leak):** "business mode" Excel is admin-only at the route even
  though the CLAUDE.md description frames business mode as PII-free — so a non-admin cannot
  pull even the de-PII'd sheet. Stricter than documented; fine for a demo.

### 4. Sensitive candidate documents (Identity / Work-auth)
- **Expected:** `canViewSensitiveDocs` / `canManageSensitiveDocs` (admin) on BOTH serve route
  and create/edit actions.
- **Guard:**
  - Serve route `src/app/api/documents/[id]/route.ts:31-32` (auth) + `:47-49`
    (`isSensitiveCategory(doc.category) && !canViewSensitiveDocs(user)` → 403).
  - `createCandidateDocument` `src/server/actions/candidate-documents.ts:58-60` — sensitive
    category requires `canManageSensitiveDocs`.
  - `updateCandidateDocument` :137-142 — gates on BOTH source and destination category
    (can't move a doc INTO a sensitive category as a recruiter).
  - `deleteCandidateDocument` :185-187 — sensitive delete no-ops for non-admin.
- **Verdict:** ENFORCED · **Severity:** —

### 5. Résumé serve route
- **Expected:** Requires an authenticated user (no unauthenticated blob stream).
- **Guard:** `src/app/api/resumes/[id]/route.ts:33-34` — `getCurrentUser()`; `!user` → 401
  before any blob lookup. Private blobs are only reachable through this authenticated route.
- **Verdict:** ENFORCED · **Severity:** —
- **Note (informational):** Any authenticated user (recruiter included) can stream ANY résumé
  by id — there is no per-candidate ownership ACL. This matches the app's documented "small
  trusted team, all recruiters see all candidates" model and the permissions.ts comment about
  future granular IAM. Not a role-escalation leak; flag only if per-recruiter candidate
  isolation becomes a requirement.

### 6. Bench marketing credentials (password field)
- **Expected:** `canViewBenchCredentials` (admin); masked password must not be sent to a
  non-admin in the payload, not merely CSS-hidden.
- **Guard:**
  - Detail page `src/app/(dashboard)/bench/[id]/page.tsx:41,121-128` — `<BenchCredentials>`
    (which holds `marketingPassword`) is rendered only when `canViewBenchCredentials(user)`
    is true. Because this is a Server Component, the password is dropped **before render** for
    a non-admin — it never appears in the HTML sent to the client. This is server-side
    enforcement, not CSS hiding.
  - Edit page `src/app/(dashboard)/bench/[id]/edit/page.tsx:59-60` — blanks
    `marketingEmail`/`marketingPassword` to `""` unless `canCreds`.
  - Write path `src/server/actions/bench-consultants.ts:123` — `stripCredentials(data)` when
    `!canViewBenchCredentials(user)`, so a recruiter cannot POST a password either.
- **Verdict:** ENFORCED · **Severity:** —
- **Defense-in-depth note (low):** `getBenchConsultant` (`src/server/queries/bench-consultants.ts:120`)
  uses `include` with no field-level `select`, so it fetches `marketingPassword` from the DB
  for **every** viewer. The value is correctly discarded in the Server Component before it
  reaches the client, so there is no exposure today — but it is a latent footgun: any future
  code that forwards the whole `c` object to a Client Component (or serializes it) would leak
  the password. Recommend selecting credential fields only when `canViewBenchCredentials`.

### 7. User management (create / edit / change role)
- **Expected:** Admin-only.
- **Guard:** `src/server/actions/users.ts:15-17` — `saveUser` checks `actor.role !== "ADMIN"`
  → error, before any parse/write. Also has a self-lockout guard (:34-39: can't deactivate
  self or drop own admin role). This is the only user-mutation action.
- **Verdict:** ENFORCED · **Severity:** —

### 8. Audit log `/audit`
- **Expected:** Admin-only page.
- **Guard:** `src/app/(dashboard)/audit/page.tsx:24` — `requireUser()` then
  `if (user.role !== "ADMIN") return <Forbidden />`. Query runs only after the check.
  `?action=` is validated against the enum (:34-40) to prevent a crafted-param 500.
- **Verdict:** ENFORCED (PAGE-level, which is the correct boundary here — the audit log is a
  read-only Server Component with no separate data-fetch action a recruiter could call) ·
  **Severity:** —

### 9. Submission assignment / self-claim
- **Expected:** A recruiter cannot submit to a job they're not assigned to without passing the
  claim gate; admins submit freely.
- **Guard:** `src/server/actions/submissions.ts:87-100` — `createSubmission`:
  - `isAdmin = user.role === "ADMIN"`.
  - Non-admin without a `JobAssignment` and without `claim=1` → returns
    `needsConfirm: "not_assigned"` (blocks the write).
  - With `claim=1`, `createSubmissionRecord` (`src/server/submission-create.ts:132-157`)
    upserts the `JobAssignment` + logs `RECRUITER_ASSIGNED` in the SAME transaction as the
    submission. Admins bypass the assignment requirement (correct).
  - Duplicate / iLabor-closed / iLabor-cap gates also enforced server-side in
    `createSubmissionRecord` (:98-128) under a `pg_advisory_xact_lock`.
  - The convert path (`convertRequirementToSubmission`) routes through the same helper, so the
    self-claim + gates apply there too.
- **Verdict:** ENFORCED · **Severity:** —

---

## Summary

| # | Action / Resource | Expected | Server guard | Verdict |
|---|---|---|---|---|
| 1 | Org entities (client/vendor/source) write | Admin | `org.ts:25` | ENFORCED |
| 2 | VPR create/edit/cancel/close | Admin+lead | `requirements.ts:45,111,174,208` | ENFORCED |
| 3 | Export routes (excel/full) | Admin | `export/{full,excel}/route.ts:10-22` | ENFORCED |
| 4 | Sensitive docs (serve + write) | Admin | `documents/[id]/route.ts:47`; `candidate-documents.ts:58,137,185` | ENFORCED |
| 5 | Résumé serve route | Any auth user | `resumes/[id]/route.ts:33` | ENFORCED |
| 6 | Bench credentials | Admin | page `bench/[id]/page.tsx:121`; write `bench-consultants.ts:123` | ENFORCED |
| 7 | User management | Admin | `users.ts:15` | ENFORCED |
| 8 | Audit log page | Admin | `audit/page.tsx:24` | ENFORCED |
| 9 | Submission self-claim gate | Assigned/claim | `submissions.ts:87`; `submission-create.ts:132` | ENFORCED |

**Genuine privilege-escalation leaks (hidden-button + unguarded action): 0.**

Every sensitive Server Action and Route Handler re-checks role/permission at the top of the
action body — the trust boundary is the action, not the UI. No "hidden button, open action"
pattern was found.

### Non-blocking observations (not leaks)
- **6 (low, defense-in-depth):** `getBenchConsultant` over-fetches `marketingPassword` for all
  viewers via `include`; safe today because the Server Component drops it pre-render, but a
  future refactor that forwards the row to a client boundary would leak it. Prefer a
  conditional `select`.
- **5 (informational):** No per-candidate/per-recruiter ACL on résumé or document reads — any
  authenticated recruiter can fetch any candidate's résumé by id. Consistent with the
  documented "all recruiters see all candidates" model; only a concern if candidate isolation
  becomes a requirement (see permissions.ts "Granular IAM" note).
- **3 (informational):** Excel "business" export is admin-only at the route — stricter than the
  "PII-free, business-safe" framing in the docs. No action needed for the demo.
