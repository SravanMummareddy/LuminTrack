# 08 — Validation and forms

> **In plain English.** Every form in the app — create job, edit
> candidate, change submission status — uses the same pattern. One
> Zod schema, used twice: once on the client for live errors, once
> on the server because we never trust the client.

## The pieces

| File                                  | Role                                                  |
|---------------------------------------|-------------------------------------------------------|
| `src/lib/validation/<resource>.ts`    | The Zod schema. One per resource (job, candidate, submission, interview, note, resume, org, user, auth, ilabor-import). |
| `src/lib/validation/common.ts`        | Reusable preprocessors (`optionalText`, `optionalUrl`, `toFieldErrors`, …). |
| `src/lib/form-state.ts`               | `FormState` type returned by every form action.       |
| `src/components/<feature>/<x>-form.tsx` | Client form. Uses `useActionState`.                 |
| `src/server/actions/<resource>.ts`    | The Server Action — re-validates the same schema.     |

## The round-trip

```
[Browser]
  user types into form
  ─► react-hook-form (optional) + same Zod schema for client-side
     inline validation
  ─► <form action={createX}> submits as multipart/form-data
[Server]
  Server Action runs
  ─► requireUser()
  ─► schema.safeParse(formData)
        success: do the write inside $transaction + logActivity
        failure: return { error, fieldErrors }
  ─► revalidatePath() + redirect()   OR   return { fieldErrors }
[Browser]
  useActionState() receives the FormState
  fieldErrors render inline under each input
```

## The Zod schema

Example from `src/lib/validation/job.ts`:

```ts
export const jobSchema = z
  .object({
    title: z.string().trim().min(1, "Job title is required.").max(200),
    clientId: z.string().min(1, "Select a client."),
    vendorRate: optionalNonNegativeNumber,
    startDate: optionalDateTime,
    workMode: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.enum(WORK_MODE_VALUES).optional(),
    ),
    // ...
  })
  .superRefine((val, ctx) => {
    if (val.sisterCompanySourceId === OTHER_SOURCE && !val.sourceOther) {
      ctx.addIssue({ code: "custom", path: ["sourceOther"], message: "..." });
    }
  });
```

Patterns to know:

- **`optionalText` / `optionalEmail` / `optionalUrl` / `optionalNonNegativeNumber` / `optionalPositiveInt` / `optionalDateTime`** — defined in `common.ts`. They preprocess empty strings into `undefined` before validating. Saves every schema from re-implementing "treat blank as not-provided."
- **`z.preprocess`** wraps enum coercion when a `<select>` might emit `""` for "not chosen."
- **`superRefine`** for cross-field rules ("if X is set, Y must also be set").
- **`z.enum([...] as const)`** for status / priority / role enums. The enum values are exported separately so the form `<select>` can iterate them.

## `FormState` and `useActionState`

The action signature is always the same:

```ts
export async function createJob(_prev: FormState, formData: FormData): Promise<FormState> { ... }
```

The shape:

```ts
type FormState = {
  ok?: boolean;
  error?: string;                    // banner message
  fieldErrors?: Record<string, string>; // keyed by Zod path (joined by ".")
  needsConfirm?: boolean;            // see "duplicate confirm" below
};
```

Client form:

```tsx
"use client";
import { useActionState } from "react";
import { createJob } from "@/server/actions/jobs";

const [state, action, pending] = useActionState(createJob, {});

return (
  <form action={action}>
    {state.error && <Alert tone="red">{state.error}</Alert>}
    <Field label="Title" error={state.fieldErrors?.title} />
    {/* ... */}
    <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
  </form>
);
```

Wins:

- Native HTML `<form action={...}>` works even without JS — the server
  action accepts a regular form submission.
- `useActionState` is the React 19 hook that hands you state +
  pending boolean.
- `fieldErrors[name]` matches the Zod `path.join(".")` — see
  `toFieldErrors()` in `common.ts`.

## The `toFieldErrors` helper

```ts
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
```

Picks the *first* error per field (a field with multiple errors only
shows the most relevant one). Keys at the form root land under
`"form"` for top-level banners.

## File uploads — not used today

Forms are all `multipart/form-data` but we don't accept binary file
uploads anywhere. Résumés are Drive URLs. Vercel Blob is in the
deps for when we cut over.

## Special pattern — duplicate confirm

`createSubmission` checks whether the same candidate has been
submitted to the same job before. If yes, the action returns

```ts
{ needsConfirm: true, fieldErrors: { duplicateReason: "Required to override" } }
```

The form sees `needsConfirm`, reveals a hidden `duplicateReason`
input, and re-submits with both `duplicateReason` and an
`override=true` hidden field set. Audit row captures the reason.

This pattern (action pauses, form prompts, user resubmits with extra
context) generalises — use it any time a write needs a soft
confirmation step.

## Special pattern — `useTransition` for in-page status updates

Submission status change uses

```tsx
const [pending, start] = useTransition();
const onSubmit = (form: FormData) => start(() => updateStatus(form));
```

instead of `useActionState`, because we don't need to roll back a
form — we redirect on success and the page Server Component
re-renders. `useTransition` gives a pending boolean for the button.

## Best practices

- **Server validates the same schema.** Always. Even if the client
  form already validated. Compromised client → server still safe.
- **Errors are sentences, not codes.** "Select a client." not
  `client_required`. The Zod message is the UI string.
- **Tighten as you learn.** Start permissive; add `superRefine`
  rules as the team reports edge cases.
- **No double-fetch in client forms.** Pages already render with the
  full data. Forms are uncontrolled inputs with `defaultValue`; the
  Server Action handles the POST.
