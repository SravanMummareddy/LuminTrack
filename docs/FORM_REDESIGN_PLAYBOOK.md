# Form-redesign playbook — apply the Jobs pattern to Candidates / Bench / Submissions

The Job form (`#86`) established a reusable "forms-discipline" pattern. This is the
generic recipe for rolling it out to the remaining forms. **Jobs is the only form on
this pattern today**; the targets are `candidate-form`, `bench-consultant-form`, and
`submission-form` (+ `submission-edit-form`).

**Standing rule:** mock up any visible surface for sign-off *before* writing component
code, and re-confirm the section grouping + which fields become required vs N/A with the
owner — those are product calls, not mechanical ones.

---

## What the Jobs redesign actually did (the pattern)

1. **Card sections** — the form is broken into a few numbered `FormSection` cards
   (Jobs used 4: *The role · Where we found it · Requirement details · Description*),
   instead of one long flat list or a `<details>` drawer.
2. **"Required, or explicitly N/A"** — every field is either filled *or* consciously
   marked N/A. No silent blanks. A value **or** an explicit N/A toggle satisfies the
   requirement; N/A stores `null`.
3. **Enum-required** — selects use an explicit required option (empty → a required error,
   not a silent "not set").
4. **Derived, read-only fields** — computed from inputs (Jobs: `jobDuration(start, end,
   estimated)`), shown but not entered.
5. **Soft close-gates** — block a terminal transition until a real value exists (Jobs:
   can't mark Filled/Closed, or create a Placement, until a *non-estimated* start date).
6. **Audit + org plumbing** — `createdById`/`updatedById`, org-scoped writes, display IDs
   + manager-only detail pages for any first-class entity the form references.

---

## The reusable primitives (already built — reuse, don't reinvent)

| Piece | Where | What it does |
|---|---|---|
| `FormSection` | `src/components/jobs/job-form.tsx:79` | Numbered card: `rounded-xl` body + `rounded-t-xl` tinted header. **Never `overflow-hidden`** (it clips dropdowns — see DEVLOG 2026-07-12). Consider promoting it to `src/components/ui/` when the 2nd form needs it. |
| `NullableField` + `NaToggle` | `src/components/ui/nullable-field.tsx` | The required-or-N/A wrapper. Renders a hidden `{name}__na="1"` when N/A is toggled; caller disables/clears the control. `required` prop draws the `*`. |
| `enumRequired(values, msg)` | `src/lib/validation/job.ts:36` | Zod preprocess: empty string → a required error on an enum. Copy into the target's schema (or lift to `validation/common.ts`). |
| value-or-N/A `superRefine` | `src/lib/validation/job.ts:83` | The `if (!val.x && !val.xNa) ctx.addIssue(...)` rule per N/A field. |
| `readJob`'s `__na` reads | `src/server/actions/jobs.ts:88` | Action reads `{field}` and `{field}__na` from FormData, feeds both to the schema. |

---

## Generic recipe (repeat per form)

### 1. Mock + owner sign-off (before code)
Interactive mock: the section grouping, which fields are required vs value-or-N/A, any
derived/read-only fields, any close-gate. Owner approves grouping + the required/N/A split.

### 2. Schema (`src/lib/validation/<entity>.ts`)
- Make the agreed fields required (`.min(1, "...")`, `enumRequired(...)` for selects).
- For each value-or-N/A field add `xNa: z.preprocess((v) => v === "1", z.boolean().default(false))`
  and a `superRefine` rule (`if (!val.x && !val.xNa) addIssue`).
- Keep the schema shared by client form + server action (single source of truth).

### 3. Action (`src/server/actions/<entity>.ts`)
- In the `read<Entity>` parse map, read both `formData.get("x")` and
  `formData.get("x__na")` (→ `xNa`).
- On write, N/A → `null` (persist the *flag* only where it drives behaviour, e.g. Jobs'
  `startDateEstimated`).
- **Org-scoping (non-negotiable):** mutations use `const db = await getScopedPrisma()` and
  write **scalar FKs** (`createdById: user.id`), never nested `{ connect }` — the
  org-scope extension stamps a scalar `organizationId`, which only coexists with
  all-scalar (unchecked) create input. Wrap write + `logActivity` in one
  `(await getScopedPrisma()).$transaction(...)`. Set `createdById` on create,
  `updatedById` on update.

### 4. Component (`src/components/<area>/<entity>-form.tsx`)
- Regroup fields into `FormSection` cards (numbered, matching the mock).
- Wrap required-or-N/A fields in `NullableField`; toggling N/A disables+clears the control
  and (via the wrapper) posts `{name}__na="1"`.
- Add any derived read-only line (compute in a `src/lib/format.ts` helper, unit-test it).
- Reuse existing controls: `SuggestInput` for learned dropdowns (never a native
  `<datalist>`), `SearchSelect` for entity pickers, the quick-add dialog for inline org
  entities. Wire `OrgEntityLink` where the form shows a client/vendor/source/referrer name
  (link for managers, plain text for recruiters).

### 5. Tests + verification
- **Unit:** the value-or-N/A schema rule (fires on blank, passes on value *or* N/A) + any
  new derived helper (edge cases: no end, negative, estimated). `npm test` + `tsc` green.
- **Integration (if the action changed):** follow the suite's scoped-write pattern —
  `seedOrg`/`seedBasics` return a scoped `db`; mock `getScopedPrisma` to it; write setup
  with scalar FKs. See DEVLOG 2026-07-12.
- **Browser (manager + recruiter):** required blocks, N/A satisfies, derived value updates,
  close-gate blocks the terminal action, entity names link for managers / plain for
  recruiters. Screenshot the result.
- **DEVLOG** entry if anything non-trivial surfaced.

---

## Gotchas (learned the hard way)

- **`overflow-hidden` clips dropdowns.** Round the header (`rounded-t-xl`), not the whole
  card. (DEVLOG 2026-07-12.)
- **N/A ≠ blank.** N/A is a conscious "unknown" that satisfies the requirement and stores
  `null`; a blank is a validation error. Don't collapse the two.
- **Scalar FKs only** through the scoped client (see step 3) — nested `{ connect }` breaks
  org-stamping.
- **Submission form is deferred work (task #31):** 5 sections + the same N/A pattern; its
  gate engine (`collectSubmissionGates`, `pendingGates[]`) is untouched — restructure the
  *form*, not the gates.
- **Don't rebuild what exists.** Bench/candidate/submission forms already have full field
  sets + schemas; this is a *restructure*, not a rewrite. Reuse the primitives above.

---

## Order of attack (suggested)
1. **Submissions** (task #31) — already scoped + planned (5 sections + N/A). Highest value.
2. **Candidates** — `candidate-form.tsx` + `validation/candidate.ts`.
3. **Bench** — `bench-consultant-form.tsx` + `validation/bench.ts` (largest field set;
   from the stakeholder spreadsheet).

Each is one PR, mock-gated, following the recipe above.
