# Q 04 — System design

System-design questions in junior/mid interviews tend to be
*small*: "design a URL shortener," "design a notification
system," "scale the app you built." LuminTrack gives you
plenty of concrete experiences to draw on.

---

### Q1. "Walk me through the system you built."

Answer with `03-system-design/01-overall-architecture.md`. Aim
for 3–5 minutes.

---

### Q2. "How would you scale it 100×?"

Answer with `03-system-design/03-scaling-to-100x.md`. Prioritise
audit partitioning → keyset pagination → Redis rate-limit →
reports rewrite.

---

### Q3. "Design a notification system."

**Approach.**

1. Clarify scope. In-app + email? Realtime + digest? Mobile push?
2. Sketch the pipeline:
   ```
   [event] → [queue] → [worker] → [in-app row + email send]
                                    ↓
                                [user preferences]
   ```
3. Trade-offs to mention:
   - Fan-out vs fan-in (compute per-user list at event time or
     pull when user logs in).
   - At-least-once vs exactly-once delivery.
   - Email provider (SES, Postmark, Resend) and deliverability.
   - Digest vs realtime — usually a user preference.
4. Connect to LuminTrack: "I deferred this in LuminTrack
   intentionally — solved 80% of the underlying need with a 'My
   work' dashboard card that requires zero infrastructure. The
   full pipeline is justified at 50+ users." Story 09.

**Watch out.** Don't draw Kafka unless asked. Vercel Queues or
SQS + a worker is enough at the scale you've worked at.

---

### Q4. "Design a URL shortener."

**Approach.**

1. Clarify: how short, custom slugs, analytics, expiry?
2. Schema: `links (slug PK, target_url, created_by, created_at,
   expires_at NULL)`.
3. Slug generation: base62 of an auto-increment ID, or a random
   short string with retry on collision.
4. Read path: `GET /:slug` → DB lookup → 302 redirect.
5. Scale: read-heavy. Cache hot slugs in Redis. CDN-friendly
   redirect.

**Connect to LuminTrack.** "This is similar to the display-ID
system I built — `JOB-00123` is a human-friendly name for a
cuid. The slug generation pattern is the same: monotonic
counter + padding."

---

### Q5. "Design a feed (Twitter timeline / activity feed)."

**Approach.**

1. Fan-out on write (precompute each user's feed) vs fan-out on
   read (query at read time).
2. Hybrid: precompute for active users; query at read for
   inactive.

**Connect to LuminTrack.** "The audit timeline is fan-out on
read — each detail page query `getTimelineFor(entityType, id)`
rolls up an entity's audit rows with its descendants'. Worked
at our scale; at 100× I'd cache or partition."

---

### Q6. "Design rate limiting for an API."

**Approach.**

1. Algorithm: fixed window / sliding window / token bucket.
2. Storage: in-process / Redis / distributed.
3. Key: user ID, IP, or both.
4. Headers in the response: `X-RateLimit-*`, `Retry-After`.

**Connect to LuminTrack.** Concept 18. "I picked fixed window +
in-process for an internal 10-user tool; for public APIs I'd
move to Upstash Redis."

---

### Q7. "Design auth."

**Approach.**

1. Identity store (DB users table).
2. Login: hash + verify; rate-limit attempts.
3. Session: JWT in HttpOnly cookie OR session table + cookie ID.
4. Authorization: roles, scopes, permissions.
5. Revocation strategy.
6. 2FA flow if needed.

**Connect to LuminTrack.** Concepts 16/17/18. Be ready to defend
JWT-over-session and bcrypt-cost-10. Mention the `isActive`
re-check for revocation.

---

### Q8. "Design a search bar."

**Approach.**

1. Scale → strategy: substring (`LIKE` / `ILIKE` / Prisma
   `contains`) → Postgres FTS → external (Algolia / Meili /
   OpenSearch).
2. Indexing.
3. Frontend: debounce, keyboard nav, ARIA combobox.

**Connect to LuminTrack.** Concept... handbook workflow 13. The
global search uses substring across 6 entities, parallelized via
`Promise.all`, served from one API route. At 100k+ rows I'd
switch to Postgres FTS.

---

### Q9. "Design an audit log."

Concept 07 + story 10 are your raw material. Hit:
- Append-only.
- Atomically tied to writes.
- Polymorphic with discriminator, or per-entity tables.
- Partition by time at scale.

---

### Q10. "Design a multi-tenant app."

Be honest: "I haven't built one." Then talk through:
- Schema-per-tenant vs row-level `tenantId` on every table.
- Connection-pool implications.
- Backup / restore granularity.
- Where you'd put `tenantId` in every Prisma query (or use
  Postgres RLS).
- Connect to LuminTrack: "LuminTrack is single-tenant. If we
  ever offered it to other recruiting teams, I'd add a
  `tenantId` column to every primary entity and enforce via
  Postgres Row-Level Security."

---

### Q11. "Design file uploads."

**Approach.**

1. Direct-to-S3 (or Vercel Blob) signed-URL upload.
2. Webhook back on completion.
3. Metadata row in DB.
4. Virus scan if untrusted source.

**Connect to LuminTrack.** "I deferred file uploads. Today
résumés are Google Drive *links* — recruiters paste a Drive URL
and we embed Google's iframe viewer. Vercel Blob is in the
deps for when a Blob store is provisioned and the team is ready
to upload directly."

---

### Q12. "Design a job queue."

**Approach.**

1. Queue (Redis / RabbitMQ / SQS / Vercel Queues).
2. Worker process polls.
3. Idempotent handlers.
4. Retry policy + dead-letter.

**Connect to LuminTrack.** "No queue today. The closest is the
iLabor importer, which is an interactive admin action, not a
background job. At 100× scale I'd add Vercel Queues for
nightly reports and engagement-nudge emails."
