# 20 — Validation and Zod

> **In plain English.** A schema is a description of what data
> should look like. Zod is a TypeScript-first library that lets
> you write the schema once, use it on the client (for live form
> errors), use it on the server (because you never trust the
> client), and *also* get a TypeScript type out of it for free.

## The technical core

### The "validate at the boundary" rule

Boundaries: anywhere data crosses from "I don't control it" to
"I do." That includes:

- HTTP request body / FormData.
- Query string / URL params.
- Webhook payloads from third parties.
- Read of an external JSON file (LuminTrack's iLabor import).
- LocalStorage reads (might have been edited or stale).

Inside the trusted code, you don't re-validate — you rely on the
type system.

### Schema-first vs type-first

| Approach        | Description                                           |
|-----------------|-------------------------------------------------------|
| Type-first      | Write the TS type. Validate manually with `if` checks.|
| Schema-first    | Write a Zod schema. The type is *inferred* from it.   |

Schema-first wins because validation and type stay in lock-step
automatically.

```ts
const jobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(["OPEN", "ON_HOLD", "CLOSED", ...]),
});
type JobInput = z.infer<typeof jobSchema>;
```

`safeParse` returns `{ success, data | error }`. Use it on FormData
in Server Actions:

```ts
const parsed = jobSchema.safeParse({
  title: formData.get("title") ?? "",
  // ...
});
if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
```

### `preprocess` and `refine` / `superRefine`

- `z.preprocess(fn, schema)` — transform before validation.
  LuminTrack uses this to turn empty strings into `undefined`
  (`optionalText`).
- `.refine(fn, msg)` — single-field custom check.
- `.superRefine(fn)` — cross-field validation. LuminTrack uses it
  for "if source is 'Other', `sourceOther` must be set."

## Where it lives in LuminTrack

- `src/lib/validation/common.ts` — reusable preprocessors
  (`optionalText`, `optionalEmail`, `optionalUrl`,
  `optionalNonNegativeNumber`, `optionalPositiveInt`,
  `optionalDateTime`, `toFieldErrors`).
- `src/lib/validation/{job,candidate,submission,interview,note,resume,
  org,user,auth,ilabor-import}.ts` — one schema per resource.
- Used twice: client form (via `@hookform/resolvers/zod` or
  manual) + Server Action (`schema.safeParse(formData)`).

## How to talk about it in an interview

**Sample answer (60 sec):**

> "Validation in LuminTrack lives in `src/lib/validation/`, one
> Zod schema per resource. Each schema is used on both sides of
> the wire: the client form for live errors, and the Server
> Action for the actual gate. The server never trusts the client
> — even if the form passes, the action runs `safeParse` again.
> Zod's type inference means I write the schema once and get the
> TypeScript type for free, so the form, the action, and the
> Prisma write all share the same shape. The reusable
> `optionalText` / `optionalEmail` / `optionalDateTime`
> preprocessors handle the 'empty string means not provided'
> pattern that every form has. Cross-field rules — like 'if
> source = Other, sourceOther must be set' — go in `superRefine`."

**Expect:**

- "What if the client and server schemas drift?" → They can't —
  same file imported by both.
- "Why Zod over Yup / joi / class-validator?" → TypeScript-first,
  no decorators, no separate type definitions. Yup is comparable;
  Zod wins on TS ergonomics.
- "Where do you stop validating?" → At the boundary in. Inside
  trusted code I rely on types.

## Mistakes to avoid saying

- ❌ "Client-side validation is enough." Never. Server re-validates,
  always.
- ❌ "I validate inside every function." Validate at the boundary,
  not internally.
- ❌ "Zod is a TypeScript type-checker." It's runtime validation;
  the type-inference is a bonus.

## Go deeper

- Zod docs — they're great.
- "Parse, don't validate" (Alexis King, 2019) — the philosophical
  argument for schema-first.
