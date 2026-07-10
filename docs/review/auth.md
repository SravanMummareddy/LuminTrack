# Auth / Session / Permissions — code review

Scope: `src/lib/session.ts`, `src/lib/permissions.ts`, `src/proxy.ts`,
`src/lib/validation/*`, plus the server actions that consume them
(`submissions.ts`, `requirements.ts`, `users.ts`, `org.ts`, `placements.ts`,
`submission-create.ts`, `actions/auth.ts`, `auth-token.ts`).

Format: `path:line — problem — why it matters — suggested fix`.

---

## Critical

_None._ No auth-bypass, invertible top-level gate, or secret-handling defect
found. JWT verification pins `HS256`, rejects on any error, and re-checks
`user.isActive` on every `getCurrentUser`; the proxy fails closed
(unauthenticated → `/login`).

---

## Warning

**W1. `src/server/actions/placements.ts:32` — dead RBAC literal: `userRole === "ADMIN"` can never be true, so managers/team-leads silently cannot edit placement rates.**
`UserRole` has only `MANAGER | TEAM_LEAD | RECRUITER` (schema.prisma:15–19); the
old `ADMIN` value was retired. `canEditRates` therefore reduces to
`args.userId === args.submittedById` — a manager or team lead who is *not* the
submission's recruiter-of-record fails the gate. The placement **detail page**
gates the same UI with `hasFullAccess(user)` (`placements/[id]/page.tsx:81`), so
a manager sees the rate fields as editable, submits them, and the action
**silently drops** the new bill/pay/client rates (`mayEditRates` false at
lines 106 and 247) with no error. Result: a broken gate *and* silent data loss
for the exact users who are supposed to own rate edits.
Fix: replace the literal with the shared helper — `import { hasFullAccess }` and
make `canEditRates` return `hasFullAccess({ role: userRole as UserRole }) || userId === submittedById`
(or pass the viewer object straight through). Grep confirms this is the only
remaining live `"ADMIN"` string in `src/` outside a comment.

**W2. `src/lib/permissions.ts:62-64` — `canViewBenchCredentials` accepts *any truthy role string*, not "any signed-in user".**
`return Boolean(viewer?.role)` is intended to mean "authenticated", but it keys
off a *field* rather than the presence of a session. It is only ever called with
a real user today, so it is not currently exploitable — but the pattern is
fragile: any future caller that hands in a partial/typo'd viewer (e.g. `{}` cast,
or a viewer whose `role` was defaulted to a truthy sentinel) passes. Every other
gate here funnels through `hasFullAccess`; this one bypasses that discipline.
Fix: gate on the whole viewer object — `return Boolean(viewer)` — and let the
caller guarantee it only passes a genuine authenticated user, matching the intent
in the comment ("any signed-in recruiter").

---

## Info

**I1. `src/proxy.ts:48` — matcher excludes *any* path containing a dot (`.*\\.`), so a protected page whose segment contains a `.` would bypass auth.**
Today all dashboard routes are dot-free, so there is no live bypass; the pattern
is the standard Next.js recommendation. Flagging only so that if a future dynamic
segment can contain a user-supplied `.` (e.g. an email or filename in the path),
it would silently skip the auth check. Defence-in-depth: `requireUser()` in the
page/action still fails closed, so a bypass here only skips the *redirect*, not
the data gate. No action required unless dotted segments are introduced.

**I2. `src/server/actions/requirements.ts:82,86 / 148` — `candidateId`, `recruiterId` written as FKs without an existence check.**
A crafted/stale id reaches `vendorRequirement.create` and surfaces as an
unhandled Prisma FK violation (500) rather than a clean field error. Only
reachable by managers/team-leads (already gated by `canManageRequirements`), so
it is a robustness/UX issue, not a privilege issue. The submission path does
validate the analogous ids; the requirement path could mirror that.

**I3. `src/lib/validation/submission.ts:33` — `resumeChoice` uses `.catch("none")`, silently coercing any invalid value to "none".**
A tampered/garbled `resumeChoice` never raises a validation error; it just drops
the résumé selection. Combined with the server-side re-resolution of the résumé
(`submissions.ts:195`, which independently validates ownership), this is safe —
noting only that the silent coercion hides malformed input rather than rejecting
it. No security impact.

**I4. Session cookie has no server-side revocation / rotation.**
`SESSION_MAX_AGE` = 7 days and the JWT is stateless; deactivating a user is
enforced only by the `user.isActive` re-check in `getCurrentUser`
(session.ts:42) — which is correct and does invalidate a disabled account on the
next request. A password change (`users.ts:changeOwnPassword`) does **not**
invalidate outstanding tokens, because `sub` is the only claim. Acceptable for a
<10-user internal tool; documenting the limitation. If tighter revocation is ever
needed, add a `tokenVersion`/`sessionEpoch` claim compared against the DB.

---

## Verified good (no action)

- `auth-token.ts:29-31` — `jwtVerify` pins `algorithms: ["HS256"]` (algorithm-confusion defence); throws→null on any failure.
- `session.ts:42` — every request re-loads the user and rejects `!isActive`; stateless-JWT staleness bounded to one request.
- `submission-create.ts:174` — attribution is enforced server-side (`isAdmin ? submittedById : actor.id`); the "Submitted by" picker is UI-only and cannot be forged by a recruiter. Both entry points (direct create + VPR convert) route through this helper.
- `submissions.ts:345,131` / `updateSubmission` — re-attribution gated by `canReattributeSubmission`; admin-picked `submittedById` existence-validated.
- `users.ts:44-66` — Manager-role escalation blocked for non-managers (create *and* edit of a manager); self-lockout (deactivate / self-demote) blocked.
- `actions/auth.ts` — login rate-limited on per-(email,IP) **and** per-account buckets; `clientIp()` uses `x-real-ip` / rightmost `x-forwarded-for` hop (spoofing-resistant); generic error message avoids account enumeration; counters reset on success.
- `users.ts:changeOwnPassword` — throttled current-password check (5/15min), verifies current before rotate; schema enforces new≠current + confirm.
- `org.ts` — all three org-entity save actions (source/vendor/client) consistently gated by `requireOrgManager`.
- Schema↔action parity — no field validated on the client but written unchecked on the server; `requirementEditSchema` correctly omits `jobId` (job fixed on edit) and the edit action never reads it.
