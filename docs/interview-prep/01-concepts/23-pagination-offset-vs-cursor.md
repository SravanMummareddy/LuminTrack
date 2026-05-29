# 23 — Pagination: offset vs cursor

> **In plain English.** When a list has too many rows to show at
> once, you paginate. Two strategies. *Offset* says "skip the
> first 50 rows, give me the next 10" — simple and supports "go
> to page N." *Cursor* says "give me 10 rows after row X" —
> faster on huge datasets and stable under writes, but no "page
> number." LuminTrack uses offset because the dataset is small
> and users want page numbers.

## The technical core

### Offset pagination

```sql
SELECT * FROM job ORDER BY created_at DESC LIMIT 10 OFFSET 20;
```

- ✅ Simple. ✅ Supports "page 5 of 12." ✅ Total count gives
  "Showing 21–30 of 117."
- ❌ Slow on huge tables — Postgres still scans the offset rows.
  `OFFSET 1000000` is painful.
- ❌ Unstable under concurrent writes — a new row inserted at the
  top can push everything down, and page 2 might show a row that
  was on page 1.

### Cursor pagination

```sql
SELECT * FROM job
WHERE created_at < ?  -- the cursor (last row's createdAt)
ORDER BY created_at DESC LIMIT 10;
```

- ✅ Constant time regardless of position.
- ✅ Stable under inserts.
- ❌ No "go to page N" — only "next" and "previous."
- ❌ Cursor must be unique and ordered (createdAt + id usually).

### When to use which

| Need                             | Offset | Cursor |
|----------------------------------|--------|--------|
| 1k–10k rows                      | ✅     |        |
| Millions of rows, page deep      | ❌     | ✅     |
| Page-number UI ("page 5 of 12")  | ✅     | ❌     |
| Infinite scroll                  |        | ✅     |
| Stable under writes              |        | ✅     |

LuminTrack: thousands of rows, page-number UI desired, writes
infrequent. **Offset wins.**

## Where it lives in LuminTrack

- `src/lib/filters.ts` — `PAGE_SIZE = 10`, `SUB_PAGE_SIZE = 5`,
  `Paginated<T> = { rows: T[]; total: number; page: number }`,
  `parsePage` helper.
- `src/server/queries/jobs.ts` and friends — `skip: (page - 1) *
  pageSize, take: pageSize`.
- `src/components/ui/pagination.tsx` — `<Link>` per page number,
  page jump input when `totalPages > 3`, namespaced `paramKey`
  for sub-tables.

## How to talk about it in an interview

**Sample answer (60 sec):**

> "List pages in LuminTrack use offset pagination — 10 rows per
> page, with a page-number UI showing 'Showing 21–30 of 117.' I
> picked offset because the dataset is small (thousands of jobs,
> not millions), the team wants 'go to page N' as a real
> affordance, and the implementation is one Prisma `skip + take`.
> If the dataset grew 100x I'd switch list views to cursor —
> particularly the audit log, which can be deep — using
> `(createdAt, id)` as a compound cursor. The implementation
> wrinkle on detail pages is sub-tables: a job detail page has
> a submissions sub-table that paginates independently. The
> `Pagination` component accepts a `paramKey` prop, so the
> submissions table writes to `?subs=2` instead of `?page=2`,
> avoiding stomping on other paginated lists on the same page."

**Expect:**

- "How would you handle a 100M-row table?" → Cursor, plus consider
  whether the user *really* needs to scroll past row 100k. Often
  the answer is "give them better filters."
- "What's keyset pagination?" → Synonym for cursor with the cursor
  being an indexed key.
- "How do you compute total count?" → Separate `COUNT(*)` query.
  For huge tables, use approximate counts (`pg_class.reltuples`).

## Mistakes to avoid saying

- ❌ "Cursor is always better." Only at scale.
- ❌ "OFFSET 1000000 is fine." It isn't, but for small tables you
  don't need to care.

## Go deeper

- Use The Index, Luke — section on "paging through results."
- The Slack engineering blog post on their cursor pagination
  rollout.
