import { prisma } from "@/server/db";
import type { UserRole } from "@/generated/prisma/enums";

export type OrgNodeData = {
  name: string;
  role: UserRole;
  team: string | null;
};

export type OrgFlowNode = {
  id: string;
  type: "orgNode";
  position: { x: number; y: number };
  data: OrgNodeData;
};

export type OrgFlowEdge = { id: string; source: string; target: string };

export type OrgChart = { nodes: OrgFlowNode[]; edges: OrgFlowEdge[] };

const ROW_GAP = 130;
const COL_GAP = 210;

/** The user shape the layout needs (also the query's select). */
export type OrgUser = {
  id: string;
  fullName: string;
  role: UserRole;
  reportsToId: string | null;
  team: { name: string } | null;
};

/**
 * Builds positioned nodes + edges from the reporting chain (`reportsToId`).
 * Pure (no DB) so it's unit-testable. A strict <20-node tree lays out with a
 * trivial tidy algorithm (depth → y; parents centered over their children), so
 * React Flow only renders at the given coordinates (no client layout lib).
 * Cycle- and dangling-parent-safe.
 */
export function buildOrgLayout(users: OrgUser[]): OrgChart {
  const byId = new Map(users.map((u) => [u.id, u]));
  // A reportsToId pointing at a missing/inactive user is treated as a root.
  const parentOf = (id: string) => {
    const p = byId.get(id)?.reportsToId;
    return p && byId.has(p) ? p : null;
  };
  const children = new Map<string | null, string[]>();
  for (const u of users) {
    const parent = parentOf(u.id);
    (children.get(parent) ?? children.set(parent, []).get(parent)!).push(u.id);
  }

  const pos = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  let nextLeafX = 0;

  // Post-order: leaves take the next slot; a parent centers over its children.
  const layout = (id: string, depth: number): number => {
    if (visited.has(id)) return pos.get(id)?.x ?? 0; // cycle guard
    visited.add(id);
    const kids = children.get(id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = nextLeafX * COL_GAP;
      nextLeafX++;
    } else {
      const xs = kids.map((k) => layout(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(id, { x, y: depth * ROW_GAP });
    return x;
  };
  for (const rootId of children.get(null) ?? []) layout(rootId, 0);
  // Anyone unreachable (caught in a cycle) still renders, parked on a low row.
  for (const u of users) {
    if (!pos.has(u.id)) {
      pos.set(u.id, { x: nextLeafX * COL_GAP, y: 4 * ROW_GAP });
      nextLeafX++;
    }
  }

  const nodes: OrgFlowNode[] = users.map((u) => ({
    id: u.id,
    type: "orgNode",
    position: pos.get(u.id)!,
    data: { name: u.fullName, role: u.role, team: u.team?.name ?? null },
  }));
  const edges: OrgFlowEdge[] = users
    .filter((u) => parentOf(u.id))
    .map((u) => ({
      id: `${parentOf(u.id)}->${u.id}`,
      source: parentOf(u.id)!,
      target: u.id,
    }));

  return { nodes, edges };
}

/** The org chart for the current active users, positioned server-side. */
export async function getOrgChart(): Promise<OrgChart> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      role: true,
      reportsToId: true,
      team: { select: { name: true } },
    },
  });
  return buildOrgLayout(users);
}
