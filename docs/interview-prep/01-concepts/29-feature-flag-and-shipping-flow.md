# 29 — Feature flags and shipping flow

> **In plain English.** When you build a big feature, you don't
> have to merge it in one giant pull request. You can ship in
> small pieces, keeping new code disabled behind a flag, and turn
> it on for a few users at a time. LuminTrack doesn't have a
> full feature-flag system, but it ships features the same way
> with phased rollouts, additive migrations, and "additive only —
> existing behaviour unchanged" as a discipline.

## The technical core

### Feature flags

A flag is a runtime check:

```ts
if (flags.enabled("new-dashboard")) {
  return <NewDashboard />;
}
return <OldDashboard />;
```

Two flavours:
- **Static flags** — env vars, config files. Change requires
  deploy.
- **Dynamic flags** — service like LaunchDarkly, GrowthBook,
  Statsig. Toggle live, gradually roll out.

### Why flags matter

1. **Decouple deploy from release.** Code on prod, off for users.
2. **Gradual rollout.** 1% → 10% → 100%, watching metrics.
3. **Instant rollback.** Toggle off without redeploying.
4. **A/B testing.** Half see A, half see B; compare.

### The shipping pattern LuminTrack uses

Without a flag service:

1. **Phase-by-phase work.** iLabor import was Phases 0–8a + b,
   each PR additive.
2. **Additive-only schema migrations.** New columns are nullable;
   old code keeps working. The drop-the-unique-constraint
   migration was deliberately phased: app stops relying on it
   first, *then* the constraint is dropped.
3. **Default-off paths.** New columns hidden in column pickers
   until tested.
4. **Confirm-with-user between phases.** From CLAUDE.md:
   "phase-by-phase with product-owner confirmation between
   phases."

### When you NEED a flag service

- Customer-facing apps with non-trivial blast radius.
- Multi-region / multi-tenant rollouts.
- A/B experiments needing statistical rigour.

LuminTrack is 10 users. The team-meeting "we're flipping this on
tomorrow" works fine.

## Where it lives in LuminTrack

- The iLabor importer was developed across Phases 4–8a, each a
  separate PR (`/jobs/import` UI, then advisory lock + per-job
  audit, then history page, etc.). See `CLAUDE.md`.
- Polish rounds: "Round 2", "Round 3", "Tier 1 pre-demo fixes"
  — each a clearly-bounded PR set.
- New columns (e.g. `Candidate.tags`, `lastContactedAt`, `source`)
  shipped nullable + UI-toggleable via the columns menu, so
  early adopters tested without disrupting others.

## How to talk about it in an interview

**Sample answer (75 sec):**

> "LuminTrack doesn't run a flag service like LaunchDarkly — at
> 10 users it'd be overkill — but I ship as if it did. Every
> feature lands in additive PRs: new database columns are
> nullable so old code keeps working, new UI columns are
> hidden-by-default in the column picker so the column-prefs
> hook can opt-in without disrupting users who haven't seen it
> yet, and big features like the iLabor importer rolled out over
> eight phases with the product owner confirming between each.
> The drop-the-unique-index-on-submissions migration was a good
> example: I first moved the duplicate check from the DB to the
> action layer (with confirm + reason capture), shipped that and
> verified, *then* the next migration dropped the constraint.
> Two-phase, additive, safe to roll back. If LuminTrack ever
> went customer-facing I'd integrate GrowthBook or LaunchDarkly
> for genuine runtime flags and gradual rollouts."

**Expect:**

- "What's a kill switch?" → A flag whose purpose is 'turn the
  feature off if it explodes.' Different from a rollout flag.
- "How do you clean up old flags?" → Treat them as tech debt.
  Each flag should have an owner and an end date.
- "Branch by abstraction?" → A code pattern for shipping behind
  a flag at the interface level rather than the call site.

## Mistakes to avoid saying

- ❌ "Flags are mandatory." Many small teams ship fine without
  them.
- ❌ "Flags are free." They add complexity, branch in code, and
  rot if not cleaned up.

## Go deeper

- Pete Hodgson on "Feature Toggles (aka Feature Flags)" —
  Martin Fowler's site.
- LaunchDarkly's "feature-flag-driven development" blog.
- The "branch by abstraction" pattern.
