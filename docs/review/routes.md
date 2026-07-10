# Code Review — App Routes & API Handlers

Domain: `src/app/**/*.tsx` (page/layout Server Components) + `src/app/api/**/route.ts`
Reviewed: 2026-07-10 · Next.js 16 App Router / Turbopack
Reviewer: gsd-code-reviewer (adversarial)

Format: `path:line — problem — why it matters — suggested fix`

---

## Critical

_None._ No un-authenticated Blob-serving handler, no un-awaited `params`/`searchParams`/`cookies()`/`headers()`, no UI-only auth gate on the export routes. All Blob download routes (`resumes`, `documents`, both `archives/download`, both `[id]/archive`) require a session, and the archive/export routes require `hasFullAccess`. Crons fail closed on unset `CRON_SECRET`.

---

## Warning

**W1. `src/app/api/resumes/[id]/route.ts:33-52` — no resource-scoped authorization; any signed-in user can download any candidate's résumé by iterating IDs (IDOR).**
Why it matters: `/api/documents/[id]` applies `isSensitiveCategory` + `canViewSensitiveDocs`, but the résumé route only checks `getCurrentUser()` — no category gate, no ownership/recruiter-of-record check. Résumés are PII (the handler's own comment says so and sets `Cache-Control: private`), yet a `cuid` is guessable/leakable and there is zero row-level authz. If résumé visibility is genuinely intended to be org-wide (like bench marketing credentials, per CLAUDE.md), this is acceptable-by-policy; but it is undocumented here and inconsistent with the sibling documents route. Confirm the intent with the owner.
Fix: if org-wide read is intended, add a comment stating so (mirror the `canViewBenchCredentials` rationale). Otherwise gate on admin-or-linked-recruiter, e.g. verify the caller is `hasFullAccess(user)` OR is `submittedById` on a submission referencing this `candidateResumeId` / assigned to the candidate.

**W2. `src/app/api/jobs/[id]/archive/route.ts:16` & `candidates/[id]/archive/route.ts:17` — auth check uses `hasFullAccess(user)` on a possibly-null `user`, then dereferences `user!.id` at line 28/29.**
Why it matters: `hasFullAccess(null)` returns `false` so the request is correctly rejected when unauthenticated — the `user!` non-null assertion is only reached after the guard, so it is safe today. But the pattern relies on `hasFullAccess` never returning `true` for `null`, and the `!` assertion silences the compiler rather than proving it. A future refactor of `hasFullAccess` could reintroduce a null-deref crash.
Fix: add an explicit `if (!user) return 401;` before the `hasFullAccess` check (as the export/full and excel routes do), then drop the `!` assertions. Cheap, removes the footgun, and makes the two-tier 401/403 semantics consistent across all handlers.

**W3. `src/app/api/export/full/route.ts:18-26` & `export/excel/route.ts:46-54` — audit row is written and committed, then the export payload is streamed/serialized outside the transaction; a client abort or serialization failure after commit logs a `DATA_EXPORTED` event that never delivered data.**
Why it matters: The audit trail can over-report exports (logs "exported" when the download actually failed). For a compliance/PII-movement log this is a false positive that undermines the trail's evidentiary value. In `excel` the `bytes` are already acknowledged as unknown; in `full` the KB size is logged before the client receives anything.
Fix: acceptable as-is if the log is intended as "export was authorized/attempted." Otherwise, log after a successful stream completion, or add an explicit note (`attempted=true`) distinguishing authorized-attempt from confirmed-delivery.

---

## Info

**I1. `src/app/api/export/full/route.ts:20` and `export/excel/route.ts:48` and `jobs/imports/[id]/changelog/route.ts:190` — `logActivity` audit rows for exports set `entityType: "JOB"` even though the export spans all tables / is not job-scoped.**
Why it matters: Filtering the audit log by entity type will mis-bucket data-export events under JOB, obscuring them. Minor, but the `/audit` route offers action+user filters that this doesn't break — cosmetic.
Fix: introduce a `SYSTEM` / `EXPORT` entityType (or leave it, given `action = DATA_EXPORTED` is already the discriminating filter).

**I2. `src/app/api/export/full/route.ts:14-15` — the full JSON backup is built entirely in memory and `JSON.stringify`'d with 2-space indentation before responding.**
Why it matters: `export/excel` was deliberately converted to streaming (`streamBusinessExcel`, `Readable.toWeb`) to avoid buffering large workbooks, but `export/full` still buffers the whole DB dump plus a pretty-printed copy. On a large audit log this doubles peak memory. Out of scope per v1 (performance), noted only because it contradicts the streaming intent of its sibling.
Fix: drop the `null, 2` pretty-print (halves the string), or stream the JSON if backups grow.

**I3. `src/app/api/health/route.ts:9` — public unauthenticated endpoint runs `SELECT 1` on every hit with no rate limiting.**
Why it matters: Intended public probe; a trivial DoS amplifier only if abused. Acceptable for an internal tool. Noted for completeness.
Fix: none required; optionally cap with edge rate limiting if exposed publicly.

**I4. `src/app/api/auth/logout/route.ts:15` — logout is a `GET` that mutates state (clears the session cookie).**
Why it matters: `GET`-based state mutation is CSRF-prone in general; here the "mutation" is self-logout (deleting the caller's own cookie), which is harmless — a forged logout is a nuisance, not a vulnerability, and the handler doc explains why GET is required (redirect target for `requireUser`). Documented and benign.
Fix: none required.

---

## Verified clean (Next.js 16 gotchas)

- All `context.params` / `searchParams` accesses in reviewed handlers and pages are `await`ed (`resumes`, `documents`, `changelog`, `[id]/archive`, dashboard page). No un-awaited async request API found.
- No `revalidateTag` usage in the codebase — the Next 16 `cacheLife` second-arg gotcha does not apply; mutations use `revalidatePath`/`refresh`.
- `export/excel` streaming: `Readable.toWeb(nodeStream)` cast to `ReadableStream<Uint8Array>`, no `Content-Length` (chunked), correct.
- Both export routes gate `full` AND `business` mode server-side via `hasFullAccess` before reading any data — not a UI-only gate.
- `documents/[id]` correctly enforces the sensitive-category admin gate (`isSensitiveCategory` + `canViewSensitiveDocs`).
- Archive download/preview routes confine the `path` param to a fixed prefix (`CANDIDATE_ARCHIVE_PREFIX` / `JOB_ARCHIVE_PREFIX`) preventing read-any-blob traversal.
- Both crons reject on unset/mismatched `CRON_SECRET` (fail closed).
- `Content-Disposition` filenames are RFC 5987 percent-encoded, so header injection via a résumé/document label is not possible.
- Dashboard `layout.tsx` gates the whole authenticated tree with `requireUser()`.
