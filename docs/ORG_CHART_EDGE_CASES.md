# Org Chart — Real-World Modeling & Edge Cases

Prompted 2026-07-11: an admin edited reporting on prod and the chart "went all messed up."
This is the analysis of *why*, whether the current model matches how real org charts work
(short answer: **no — it's a deliberate MVP**), and the full edge-case taxonomy. Design/spec doc —
**no code yet**; any fix that changes the UI gets mocked up first ([[feedback_ui_mockups_first]]).

---

## 0. The core gap in one line
Current model = **`User.reportsToId` (single, nullable) + `User.teamId` + `Team.leadId`**, rendered as a
**strict single-parent tree** (positions computed server-side: depth→y, parent centered over children;
cycle-guarded flat fallback). **A real org is a DAG, not a tree** — people report to more than one
person, hold more than one role, sit in more than one team, and positions go vacant. The single-parent
tree is fine as an MVP and breaks visibly the moment reality diverges from a tidy hierarchy.

## 1. What actually broke the prod chart (concrete)
Edited state: `Sriman → sravan → Vikram → Sriman` (a **cycle**), and **no user has `reportsTo = null`**
(no apex). The layout walks down from the root; with no root it can't start, so every node falls into
the "unreachable" fallback row → a flat line of disconnected-looking boxes. Also: `sravan` is a
**Manager reporting to a Team Lead** (inverted line) and is **assigned to a team** (managers belong
above teams). One edit, four edge cases: cycle · no-root · inverted line · manager-in-team.

## 2. "Can a person report to multiple people?" — YES (this is the big one)
Very common in the real world; the current single `reportsToId` **cannot represent it**:
- **Matrix orgs** — a functional manager (e.g. Delivery) *and* a project/account manager.
- **Solid-line vs dotted-line** — one primary manager (owns comp/reviews) + one or more secondary
  (operational/day-to-day) managers, drawn as dashed edges.
- **Shared / split resources** — a recruiter split across two teams or two leads.
- **Interim / acting** — temporarily reporting to a covering manager *in addition to* their own.

To support this you need a **many-to-many reporting-edge model** (each edge typed:
`primary|dotted`, maybe weighted), which makes the graph a **DAG**. The chart then draws one solid
primary tree plus dashed secondary edges, and every "who is my manager?" rule must resolve to the
*primary*. This is a real modeling change, not a tweak.

## 3. "Can a person have multiple roles?" — YES
- A **Team Lead who also carries a recruiter req load** (lead + individual contributor).
- A **Manager who also leads a team**.
- **Acting/interim** titles alongside a substantive one.
Current model: a single `role` enum + a single `teamId` → can't represent multi-role or multi-team
membership, nor a distinct **job title** (CEO/VP/Director) separate from the permission tier.

## 4. Full edge-case taxonomy

### 4.1 Graph integrity (the reporting DAG)
| # | Edge case | Current behaviour |
|---|---|---|
| G1 | **Cycle** (A→B→A, or self A→A) | Layout cycle-guard prevents a hang, but renders broken. UI only blocks self-report, not ancestor cycles. ← hit on prod |
| G2 | **No root** (nobody at reportsTo=null) | Layout can't start → all nodes dumped to a flat fallback row. ← hit on prod |
| G3 | **Multiple roots** (co-CEOs / orphaned managers) | Rendered as several side-by-side trees; no single designated apex |
| G4 | **Orphan** (active user, no reportsTo, not the intended top) | Floats as its own root node — chart fragments |
| G5 | **Dangling/inactive parent** — reportsTo points at an **inactive** user | Chart filters `isActive`, so the parent isn't a node → the report detaches. (Delete is SetNull; **deactivate is not** — silent detach) |
| G6 | **Inverted line** — senior reports to junior (Manager→Team Lead) | Allowed; renders literally (senior appears *below* junior). ← hit on prod |
| G7 | **Skip-level** — recruiter reports straight to a Manager (no lead) | Valid; renders fine but breaks the clean 4-tier assumption |
| G8 | **Very wide fan-out / very deep chain** | Naive sibling-centering overlaps wide subtrees (no dagre/elk); deep chains get very tall |

### 4.2 Team ↔ reporting divergence (two structures that can disagree)
| # | Edge case | Current behaviour |
|---|---|---|
| T1 | `reportsTo` ≠ `team.lead` | Person shows under one manager in the **chart** but is counted in another team in the **scorecard** — silent inconsistency |
| T2 | **Team with no lead** (`leadId` null) | Members' reportsTo default (=team.lead) can't fire → orphans (G4) |
| T3 | **Manager assigned to a team** | Managers are meant to sit above teams; nothing prevents it. ← hit on prod (sravan) |
| T4 | **Lead not a member of their own team** | Allowed; chart/derivation can look inconsistent |
| T5 | **Person in multiple teams** | Not representable — single `teamId` |
| T6 | **One person leads multiple teams** | Representable (two `Team.leadId` = same user), but "which team is theirs" for the chart/scorecard becomes ambiguous |

### 4.3 Roles, tiers, titles
| # | Edge case | Current behaviour |
|---|---|---|
| R1 | **No explicit apex** — "top" = reportsTo null | Can't designate THE CEO; multiple nulls = multiple tops (G3) |
| R2 | **No job title** distinct from permission tier | Only 3 role tiers (Manager/TL/Recruiter); no CEO/VP/Director label to show on a box |
| R3 | **Multiple roles per person** | Single `role` enum — not representable |
| R4 | **CEO is seed-only** | Prod has no CEO node (a SQL migration can't hash a password) → apex is a Manager |

### 4.4 Vacancies & lifecycle
| # | Edge case | Current behaviour |
|---|---|---|
| L1 | **Vacant position** (lead left, box should stay) | No "position" concept — only real users; a vacancy just disappears |
| L2 | **Deactivated user still referenced** | See G5 — detaches reports silently |
| L3 | **Restructure in flight** | No effective-dating; the chart is a live snapshot only |

### 4.5 Rendering / layout
Wide-subtree overlap · multiple roots spreading horizontally · scattered orphan nodes ·
cycle→flat fallback (what you saw) · single-node / zero-node · very deep (tall) / very wide (scroll).

### 4.6 Missing data-entry guardrails (why it was so easy to break)
- The **Reports-to picker only excludes the user themselves** — you can pick *any* other user, so
  cycles, inverted lines, and cross-team reporting are all one click away.
- **No acyclicity check**, no "this leaves the org without a single top" warning, no "you just
  orphaned N people" warning.
- **Team and reporting don't stay in sync** — changing one doesn't reconcile the other (T1).

## 5. Directions for a real fix (pick one; mock before building)
1. **Harden the single-parent tree (cheapest).** Keep one `reportsToId`, but add: acyclicity
   validation, "exactly one apex" enforcement (an explicit `isApex`/CEO designation), orphan/second-root
   warnings, auto-sync reportsTo↔team, a `title` field for CEO/VP/etc., and a layout engine (dagre/elk)
   so wide/deep trees don't overlap. Still **no matrix** (no dual reporting). Likely enough for a
   <10-person recruiting shop.
2. **DAG with dotted lines (accurate).** Many-to-many typed reporting edges (primary solid + dotted
   secondary). Chart draws the primary tree + dashed secondaries; "my manager" resolves to primary.
   Real matrix support; bigger build; needs a real layout engine.
3. **Positions, not people (heaviest).** Model roles/positions separately from the people filling
   them → supports vacancies, multiple roles, acting/interim. Overkill unless the org is large.

**Recommendation:** for this team, **Option 1 (hardened tree + guardrails)** solves 90% — most of the
pain above is *invalid data the UI should have prevented*, not missing matrix support. Add Option 2
(dotted lines) only if the owner confirms genuine dual-reporting exists.

## 6. Immediate repair for the broken prod chart
Restore a valid tree: (a) give it **one apex** — set the top manager's `reportsTo = null`; (b) **break
the cycle** — don't let a Manager report down into a Team Lead; (c) decide whether the new manager
`sravan` sits above teams (`teamId` null) or is removed. Can be done in **Settings → Users** on prod,
or via a one-off script (prod write — needs explicit go-ahead).
