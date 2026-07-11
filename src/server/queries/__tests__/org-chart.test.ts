import { describe, it, expect, vi } from "vitest";

// Mock @/server/db before importing org-chart so importing it never constructs
// the Neon adapter (db.ts builds a client at import time). We only test the pure
// buildOrgLayout function here.
vi.mock("@/server/db", () => ({ prisma: {} }));

import { buildOrgLayout, type OrgUser } from "@/server/queries/org-chart";
import type { UserRole } from "@/generated/prisma/enums";

const u = (
  id: string,
  reportsToId: string | null,
  role: UserRole = "RECRUITER",
): OrgUser => ({ id, fullName: id, role, reportsToId, team: null });

// CEO → M → (L1, L2); L1 → (r1, r2)
const TREE: OrgUser[] = [
  u("ceo", null, "MANAGER"),
  u("m", "ceo", "MANAGER"),
  u("l1", "m", "TEAM_LEAD"),
  u("l2", "m", "TEAM_LEAD"),
  u("r1", "l1"),
  u("r2", "l1"),
];

describe("buildOrgLayout", () => {
  it("emits one node per user and one edge per reporting link", () => {
    const { nodes, edges } = buildOrgLayout(TREE);
    expect(nodes).toHaveLength(6);
    expect(edges).toHaveLength(5); // everyone but the root reports to someone
  });

  it("every edge's endpoints exist as nodes", () => {
    const { nodes, edges } = buildOrgLayout(TREE);
    const ids = new Set(nodes.map((n) => n.id));
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("stacks the hierarchy by depth (parent above its reports)", () => {
    const pos = Object.fromEntries(
      buildOrgLayout(TREE).nodes.map((n) => [n.id, n.position]),
    );
    expect(pos.ceo.y).toBeLessThan(pos.m.y);
    expect(pos.m.y).toBeLessThan(pos.l1.y);
    expect(pos.l1.y).toBeLessThan(pos.r1.y);
    // A parent centers over its children.
    expect(pos.l1.x).toBeCloseTo((pos.r1.x + pos.r2.x) / 2);
  });

  it("never collapses two nodes onto the same coordinate", () => {
    const seen = new Set<string>();
    for (const n of buildOrgLayout(TREE).nodes) {
      const key = `${n.position.x},${n.position.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("is cycle-safe: a self- or mutual-reference still renders every node", () => {
    // a → b → a is a cycle with no real root; both must still get a position.
    const cyclic: OrgUser[] = [u("a", "b"), u("b", "a"), u("solo", null)];
    const { nodes } = buildOrgLayout(cyclic);
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => Number.isFinite(n.position.x))).toBe(true);
  });

  it("treats a dangling reportsToId (missing user) as a root, not an edge", () => {
    const { edges, nodes } = buildOrgLayout([u("orphan", "ghost")]);
    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0); // "ghost" isn't a node → no edge
  });
});
