# 05 — Growth roadmap

> **In plain English.** What to learn NEXT to grow beyond what
> LuminTrack covers. The project gives you a strong base — Next +
> RSC, Prisma + Postgres, auth, audit, polymorphism, advisory
> locks. The gaps are the things that *don't* show up in a
> 10-user internal tool. Working through this list, one item at
> a time, is what turns a strong early-career engineer into a
> mid-level one.

## How to use this list

- Pick **one** item.
- Build the smallest toy that exercises it (a Saturday afternoon's
  worth).
- Write down what you learned (one paragraph in your own notes).
- Move on.

Don't read this list as a homework assignment. Read it as a menu.

## Tier 1 — gaps that will hit you on the job

### Caching with Redis

**What:** A key-value store that survives across processes and
lives in RAM. Used for sessions, rate limits, hot-row caches.

**Toy project:** Replace LuminTrack's in-process rate limiter
with Upstash Redis. Same `rateLimit(key, limit, windowMs)`
signature.

**Why it matters:** Every production app you join will use
something like Redis. Cache invalidation is the hardest problem
in CS — start now.

### Background jobs / queues

**What:** A queue (Redis, SQS, RabbitMQ, Vercel Queues) holds
work; a worker process drains it. Decouples request lifecycle
from long tasks.

**Toy project:** Add a "weekly recruiter digest" feature to
LuminTrack. Each Monday morning, every recruiter gets a summary
email. Use a queue + a worker.

**Why it matters:** As soon as you need to do anything that
takes >10 seconds (email, image processing, third-party API
call), this becomes essential.

### Real-time (WebSockets / Server-Sent Events)

**What:** Push from server to client without polling. WebSocket
for bidirectional; SSE for server-only push.

**Toy project:** Make LuminTrack's submission status changes
appear live on the detail page when another user updates them.
SSE is the lighter option.

**Why it matters:** Chat, dashboards, collaborative editing — any
"two users see the same thing" feature needs this.

### Observability — logs, metrics, traces

**What:** Structured logs, time-series metrics, distributed
traces. The three pillars.

**Toy project:** Add Sentry (or OpenTelemetry + Honeycomb) to
LuminTrack. Trace a Server Action end-to-end. Set an alert on
error rate.

**Why it matters:** Production code without observability is
guessing.

### Testing

**What:** Unit tests, integration tests, E2E tests. Patterns:
arrange-act-assert, test pyramid, fixtures.

**Toy project:** Write 5 integration tests for LuminTrack's
Server Actions using Vitest + a real test DB.

**Why it matters:** Every job will ask "how do you test this?"
You need an answer beyond "manually."

## Tier 2 — depth that distinguishes mid from junior

### Distributed systems basics

**Read:** Designing Data-Intensive Applications (Kleppmann). At
least chapters 1, 5, 7, 9. The single most influential book in
backend engineering since 2017.

### Postgres performance and `EXPLAIN ANALYZE`

**Read:** Use The Index, Luke! by Markus Winand. Free online.

**Practice:** Run `EXPLAIN ANALYZE` on LuminTrack's Reports
queries. Find one with `Seq Scan` you didn't expect. Fix it.

### Concurrency patterns deeper

**Read:** the Postgres docs chapter on Concurrency Control
(transaction isolation, MVCC, locks). It's only ~30 pages.

**Practice:** Convert LuminTrack to optimistic concurrency on
one mutation (add a `version` column to Submission, bump on
update, check in WHERE).

### Algorithms — enough to pass LeetCode-style screens

**Source:** NeetCode 150. Or "Cracking the Coding Interview"
(still the gold standard).

**Schedule:** 1 problem per day for a month. Focus on Two
Pointers, Sliding Window, Hash Map, Binary Search, Stack/Queue,
Tree DFS/BFS, Heap, Graph BFS/DFS. Skip dynamic programming
until you've done the others.

## Tier 3 — skills the job listings demand

### Cloud beyond Vercel

**What:** AWS basics — EC2, S3, RDS, IAM, CloudFront, Lambda,
SQS. Or GCP / Azure equivalents.

**Toy project:** Deploy a copy of LuminTrack to AWS — Postgres
on RDS, Next.js on a small EC2, S3 for static assets. You'll
hate it; that's the point. You learn what Vercel hides.

### CI/CD

**What:** GitHub Actions. Lint, type-check, test, deploy.

**Toy project:** Add a CI workflow to LuminTrack that runs
`npm run lint`, `tsc --noEmit`, and (once you have tests)
`vitest run` on every PR.

### Docker basics

**What:** Containers, images, Dockerfile, docker-compose.

**Toy project:** Containerise the local LuminTrack stack —
Postgres + Next dev server — with `docker-compose up`.

### Infrastructure as code

**What:** Terraform (or Pulumi). Declarative infra.

**Toy project:** Stand up a Neon DB + a Vercel project via
Terraform.

## Tier 4 — broadening the toolbox

### A second language

If you only know TypeScript/JavaScript, pick **Go** or **Python**
or **Rust** and build the same toy in it. The "I know one
language deeply but can read three others" engineer is more
valuable than the polyglot generalist.

### A graph database (Neo4j) for an evening

Just to see what relational ISN'T. Build a graph of LuminTrack's
audit log: actor → action → entity edges. Query "shortest path
of activity between two candidates."

### A vector database / embeddings

OpenAI embeddings + pgvector. Build a "find similar candidates"
feature on LuminTrack's `Candidate.skills` arrays.

### State management at scale

Read Mark Erikson's blog (Redux maintainer, but he writes about
all client state). Pick one big component in a side project
and try Zustand or Jotai. See where it shines and where it
doesn't.

## Tier 5 — soft skills that compound

### Writing well

Read Paul Graham's essays. Or "On Writing Well" (Zinsser). Write
a blog post a month about something you learned. Forces clarity.

### Code review

Open-source contributions. Review small PRs on a library you
use. Watching how experienced maintainers comment is a
masterclass.

### Reading code

Pick a small library you use and read it cover to cover. `jose`
is a great candidate — small enough to read, sophisticated
enough to learn from.

### Mentoring (when you can)

Help someone less experienced than you. Forces you to articulate
what you know. You'll discover gaps in your understanding
faster than any course.

## How long does this take

Tier 1 in 2 months of evenings.
Tier 2 in 4 months alongside Tier 1.
Tier 3 in 3 months.
Tier 4/5 ongoing.

You don't need to finish the list. You just need to keep
moving.
