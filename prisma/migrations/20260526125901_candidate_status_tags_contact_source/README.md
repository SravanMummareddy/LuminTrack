# Misnamed — see `20260526140000_…` for the actual column adds

This folder's name suffix (`candidate_status_tags_contact_source`) duplicates
the name of the next migration (`20260526140000_candidate_status_tags_contact_source/`),
but the two do different things:

| Folder | Actual job |
|--------|------------|
| `20260526125901_…` (this one) | Drops the array defaults on `Candidate.tags` / `featuredSkills` — guarded so it's a no-op on fresh DBs where the columns don't exist yet. |
| `20260526140000_…` | Creates the `CandidateStatus` enum, adds `status` / `tags` / `lastContactedAt` / `source` columns. |
| `20260526145000_restore_array_defaults` | Restores the array defaults this folder dropped. |

The "drop then re-add defaults" pattern came out of a Prisma migrate sync
between the dev DB (where the columns already existed) and the schema's
intent. By the time `20260527150000_backfill_candidate_array_nulls`
landed (2026-05-27), the array columns were locked back down to NOT
NULL with array defaults, so this dance no longer matters.

**Why not rename?** Both folders are already applied to production
(Neon). Renaming or deleting an applied migration requires
`prisma migrate resolve` on every environment — destructive cost for
cosmetic cleanup. Audit finding **F-D1** scored as
"won't fix — documented" on 2026-05-27.
