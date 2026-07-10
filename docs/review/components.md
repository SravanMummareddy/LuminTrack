# Code Review — UI Components & Client Interactivity

Scope: `src/components/**/*.tsx`. Focus on the codebase's known hazard classes
(React 19 post-action `<form>` reset snapping controlled/uncontrolled `<select>`
to first option, `cn()`/tailwind-merge override defeats, hydration-safe date
rendering, dirty-guard usage, keys/effects/focus-trap).

Legend: `path:line — problem — why it matters — suggested fix`.

---

## Warning

### W1 — job-form.tsx: uncontrolled `<select>`/`defaultValue` fields lose data (and silently mis-select) on a validation-error return
`src/components/jobs/job-form.tsx:114-517` (esp. `status` select L227-240, `discipline`
select L242-255, plus every `defaultValue` input in the "More job details" block and
`title`, rates, description, notes).

- **Problem:** `createJob`/`updateJob` return `{ fieldErrors }` **without redirecting**
  (`src/server/actions/jobs.ts:94, 109, 118, 184`), so the form stays mounted after a
  validation error. Unlike every other form in the app (submission, candidate,
  requirement, bench — all of which use controlled `value` + a `selectSyncKey` remount
  key), `JobForm` renders `title`, `status`, `discipline`, `clientRate`, `vendorRate` and
  all "More job details" fields as **uncontrolled `defaultValue`**. React 19's post-action
  `form.reset()` fires after commit: text inputs revert to their `defaultValue` (losing
  what the user typed on the failed attempt), and the `status`/`discipline` `<select>`s
  snap to their first `<option>` **and** React skips the DOM write because the value prop
  is unchanged — the exact silent-wrong-value bug the project fixed in
  `submission-form.tsx` (the `submittedById` mis-attribution).
- **Why it matters:** A user who hits any field error re-submits with a job silently
  downgraded to the first status (`OPEN`) / first discipline, or has to re-type the entire
  "More details" section. This is the documented `submittedById`-class defect, unfixed
  here. Rate fields quietly reverting is a data-integrity risk on the commercial terms.
- **Fix:** Convert `JobForm` to the controlled `fields` state + `selectSyncKey` remount-key
  pattern used by `CandidateForm`/`RequirementForm` (bump the key in a `useEffect` keyed on
  `state`, apply it to every `<Select>` and drive every field from `value`).

### W2 — interview-round-form.tsx: uncontrolled selects reset on validation error
`src/components/interviews/interview-round-form.tsx:109-239`
(`interviewType` L109, `result` L127, `interviewPlatform` L166, `supportProviderId` L227).

- **Problem:** `createInterviewRound`/`updateInterviewRound` return `{ fieldErrors }` without
  redirect (`src/server/actions/interviews.ts:41, 55, 119`); the component only calls
  `onDone()` on `state.ok`, so on an error it stays mounted. These four selects use
  `defaultValue`, so the post-action reset snaps `interviewType` to its disabled placeholder
  and `result`/`supportProviderId` to their first option — losing the user's picks. The
  `interviewMode` select next to them IS controlled (L148), showing the author knew the
  pattern but applied it inconsistently.
- **Why it matters:** After a validation error, a saved-then-rejected round re-posts with
  `result` silently reset (e.g. an intended REJECTED reverting to WAITING) — a wrong
  outcome written to the interview record.
- **Fix:** Make these four selects controlled with a `selectSyncKey` remount key, matching
  the submission/candidate forms.

### W3 — document-form.tsx: category select silently resets to first option on error
`src/components/candidates/document-form.tsx:72-84` (`category` `defaultValue`).

- **Problem:** Same class as W1/W2. The document action returns `{ fieldErrors }` /
  revalidates (no redirect); the form stays mounted on error. The `category` `<select>`
  (`defaultValue={doc?.category ?? defaultCategory ?? visibleOptions[0]?.value}`) snaps to
  `visibleOptions[0]` after the reset — a **silent wrong category** (e.g. an Identity doc
  posted as Work Auth), which matters because Identity/Work Auth are the admin-gated
  sensitive categories.
- **Fix:** Controlled value + remount key.

### W4 — placement-end-form / placement-edit-form: uncontrolled selects reset on error
`src/components/placements/placement-end-form.tsx:78 (endReason), :120-124 (replacement)`;
`src/components/placements/placement-edit-form.tsx:83-236 (all defaultValue inputs)`.

- **Problem:** Both call `onDone()` only on `state.ok` and use `defaultValue` throughout.
  The placement actions revalidate/return without redirect, so a validation error keeps the
  dialog mounted and the post-action reset snaps `endReason` back to its disabled
  placeholder and reverts the edited rate/date fields. `placement-edit-form` reverting
  `billRate`/`payRate` on a failed save is a commercial-data-integrity concern.
- **Why it matters:** Lower blast radius than W1-W3 (the placeholder reset is at least
  visible for `endReason`), but the rate/date revert in the edit form is silent.
- **Fix:** Controlled value + remount key on the selects; controlled `value` on the rate
  inputs (or accept the text-input revert as a known lesser risk, but the selects should be
  fixed).

---

## Info

### I1 — SearchSelect: no `onChange` fired when the resolved label is stale after option-list change
`src/components/ui/search-select.tsx:58-61, 114`.

- **Problem:** `selectedLabel` is derived from `options.find(o => o.value === value)`. If the
  parent's `value` is set (e.g. a prefilled `teamLead`/legacy free-text name) but is not
  present in `options`, the visible text box renders empty while the hidden input still
  posts the correct `value`. This is intentional in most call sites (they inject the saved
  value into the options list — e.g. `teamLeadChoices`), but `SearchSelect` itself gives no
  visual feedback that a value it can't label is still selected. Not a data bug (the hidden
  input is authoritative), but a UX/consistency footgun for future call sites that forget to
  inject the saved value.
- **Fix:** Consider falling back to rendering the raw `value` when no matching option/label
  is found, or documenting the "inject the saved value into options" contract on the prop.

### I2 — Dialog-hosted forms rely on remount for reset but validation errors defeat it
`src/components/candidates/resume-form.tsx`, `document-form.tsx`, interview/placement dialog
forms.

- **Observation (not a new bug):** These forms are only remounted (fresh `defaultValue`)
  when the dialog is closed and reopened. Because they persist across a validation-error
  round-trip (dialog stays open), the `defaultValue`-based reset behaviour in W2-W4 applies.
  Flagged here to note the shared root cause: the dialog-form convention of `onDone()`-on-ok
  + `defaultValue` is the systematic gap. A shared controlled-form helper (or a lint rule
  forbidding `defaultValue` on `<Select>` inside a `<form action=…>`) would prevent
  regressions.

---

## Verified clean (spot-checked, no action needed)

- `submission-form.tsx`, `submission-edit-form.tsx`, `candidate-form.tsx`,
  `requirement-form.tsx`, `bench-consultant-form.tsx` — all correctly use controlled
  `value` + `selectSyncKey` remount key for React 19 reset safety; gate reasons latched via
  hidden inputs; `claimIntent` loop fix present.
- `cn()` (`src/lib/cn.ts`) uses `twMerge` — last-wins conflict resolution confirmed. No
  component was found baking a `text-`/`bg-` class in a way that would defeat a caller
  override (the historical amber/red highlight bug).
- Date rendering in list tables (`jobs-table`, `candidates-table`, `submissions-table`)
  uses the UTC-deterministic `formatDate` (React #418-safe); `datetime-local` conversions in
  forms use local `toDateTimeLocal` only for editable inputs (correct — wall-clock intent).
- `Dialog` uses `useFocusTrap`, portals to `document.body`, guards SSR with `mounted`, and
  restores focus — focus-trap handling is sound.
- `SearchSelect` emits a bubbling `input` event on selection so the ancestor unsaved-changes
  dirty guard fires on picker-only changes (correct).
- `GuardedCancel`/`GuardedLink`/`useUnsavedChanges` dirty-guard chain is coherent.
- No missing-key issues found; the `submission-form` résumé merge dedupes ids to avoid
  duplicate-key warnings; `candidate-form` featured-skills uses the render-phase state-adjust
  pattern correctly.

---

_Reviewer: gsd-code-reviewer (components domain, deep)_
