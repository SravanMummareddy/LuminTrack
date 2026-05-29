# Q 05 — Fundamentals (OS, networking, data structures)

These are the questions that catch fullstack candidates who only
know the React layer. Be honest about what you know; reason from
first principles for what you don't.

---

## Data structures

### Q1. "Big-O of common operations?"

| Structure       | Lookup | Insert | Delete |
|-----------------|--------|--------|--------|
| Array (by idx)  | O(1)   | O(N) at front, O(1) push | O(N) |
| HashMap / Set   | O(1) avg, O(N) worst | O(1) avg | O(1) avg |
| Sorted array    | O(log N) bisect | O(N) | O(N) |
| Balanced BST    | O(log N) | O(log N) | O(log N) |
| Linked list     | O(N)   | O(1) at head | O(1) given the node |
| Heap (priority) | n/a    | O(log N) | O(log N) extract-min |

**Watch out.** "JavaScript objects are O(1)" — usually yes,
worst-case no. Same for Map.

### Q2. "When would you use a Set over a Map?"

- Set: just membership. "Have I seen this key?"
- Map: key → value associations.

**Example in LuminTrack.** `parseSkillsCsv` in
`src/server/actions/jobs.ts` uses `new Set(...)` to dedupe
comma-separated skills.

### Q3. "Hash collisions?"

- Multiple keys mapping to the same bucket. Resolved via chaining
  (linked list per bucket) or open addressing (probe to next
  slot).
- Pathological collisions degrade O(1) to O(N).

### Q4. "Tree vs graph?"

- Tree: connected, acyclic. One root.
- Graph: any nodes + edges. Cycles allowed.

**Example.** LuminTrack's "Activity rollup" is tree-like: a Job
has Submissions has Rounds. Traversal is "all descendants."

---

## Operating systems

### Q5. "What's a process vs a thread?"

- Process: own memory space, own resources.
- Thread: lighter; shares memory with siblings.
- Node.js is single-threaded for JS execution; uses libuv
  thread pool for IO.

**Example.** Node Server Actions run on one event loop per
process. Vercel Fluid Compute reuses one process for many
requests in parallel — JS is single-threaded, so the model
relies on async IO.

### Q6. "Blocking vs non-blocking IO?"

- Blocking: thread stops until the IO returns.
- Non-blocking: thread continues; you get a callback / promise
  later.
- Node is non-blocking by default; async/await sugar on top.

### Q7. "What's a deadlock?"

- Two processes each hold a lock the other needs. Neither
  releases. Forever.
- Prevent by: lock ordering, lock timeouts, deadlock detection.

**Example.** Avoided in LuminTrack by using the advisory lock
*around* the work, not inside a multi-row lock dance.

### Q8. "Stack vs heap?"

- Stack: function call frames, local variables, fast, LIFO.
- Heap: objects, dynamic allocation, slower, GC'd.

---

## Networking

### Q9. "What's HTTPS?"

- HTTP over TLS.
- TLS handshake exchanges keys; subsequent traffic encrypted.
- Certificate verifies server identity.

### Q10. "What happens when you type a URL?"

The classic. Be brief but accurate:

1. DNS resolves the hostname to an IP.
2. TCP three-way handshake to the IP.
3. TLS handshake.
4. HTTP request sent.
5. Server responds with status + headers + body.
6. Browser parses HTML, requests JS/CSS/images, runs scripts,
   paints.
7. Hydration if SSR.

### Q11. "HTTP status code families?"

- 1xx: informational.
- 2xx: success (200, 201, 204).
- 3xx: redirect (301 permanent, 302 temporary, 304 not modified).
- 4xx: client error (400 bad, 401 unauthenticated, 403
  forbidden, 404 not found, 409 conflict, 429 too many).
- 5xx: server error (500, 502 bad gateway, 503 unavailable,
  504 gateway timeout).

### Q12. "REST vs RPC vs GraphQL?"

- REST: resource-oriented URLs, HTTP verbs.
- RPC: function-call style. Server Actions are RPC.
- GraphQL: single endpoint, client specifies query shape.

**Example.** LuminTrack uses RPC via Server Actions internally,
plus one REST-ish route for global search.

### Q13. "TCP vs UDP?"

- TCP: connection-oriented, ordered, reliable. HTTP, SSH, most
  app traffic.
- UDP: connectionless, no ordering, no retransmit. DNS, video
  streaming, games.

### Q14. "What's a cookie?"

- Key-value pair set by server, sent by browser on subsequent
  requests to the same domain.
- Flags: `HttpOnly` (no JS access), `Secure` (HTTPS only),
  `SameSite` (cross-site send policy), `Path`, `Domain`,
  `Max-Age`.

**Example.** `lumintrack_session` is `HttpOnly`, `Secure` in
prod, `SameSite: lax`, `Path: /`, 7-day expiry.

### Q15. "CORS?"

- Browser security mechanism. Cross-origin requests need
  explicit server consent via `Access-Control-Allow-Origin`.
- Preflight (`OPTIONS`) for non-simple requests.

**Example.** LuminTrack doesn't need CORS — the browser hits
the same origin as the server.

---

## When you don't know

Honest is best. Try in order:

1. Clarify the question.
2. Reason from first principles aloud.
3. Connect to something you do know.
4. "I don't know, but here's how I'd find out."

"I don't know but here's how I'd learn" beats anything
confidently wrong.
