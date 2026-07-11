import dagre from "@dagrejs/dagre";
import { getScopedPrisma } from "@/lib/session";
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

// Card size (mirrors OrgNodeCard `w-44` + padding) so dagre reserves the right
// footprint; gaps between siblings (nodesep) and between rows (ranksep).
const NODE_W = 180;
const NODE_H = 80;
const NODE_SEP = 40;
const RANK_SEP = 70;

/** The user shape the layout needs (also the query's select). */
export type OrgUser = {
  id: string;
  fullName: string;
  role: UserRole;
  reportsToId: string | null;
  team: { name: string } | null;
};

/**
 * Would making `userId` report to `managerId` close a loop? Walks up from the
 * proposed manager; a cycle exists if we reach `userId` (i.e. the manager
 * already reports, directly or indirectly, to this user). Pure + bounded.
 */
export function reportsToCreatesCycle(
  chain: { id: string; reportsToId: string | null }[],
  userId: string,
  managerId: string,
): boolean {
  if (userId === managerId) return true;
  const parentById = new Map(chain.map((u) => [u.id, u.reportsToId]));
  let cursor: string | null = managerId;
  for (let hops = 0; cursor && hops <= parentById.size; hops++) {
    if (cursor === userId) return true;
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

/**
 * Builds positioned nodes + edges from the reporting chain (`reportsToId`).
 * Pure (no DB) so it's unit-testable. Uses dagre to lay out a top-down tree so
 * wide fan-outs and deep chains don't overlap; React Flow just renders at the
 * given coordinates (no client-side layout). Dagre breaks cycles internally, so
 * a stray cycle still lays out instead of hanging; dangling parents drop to roots.
 */
export function buildOrgLayout(users: OrgUser[]): OrgChart {
  const byId = new Map(users.map((u) => [u.id, u]));
  // A reportsToId pointing at a missing/inactive user is treated as a root.
  const parentOf = (id: string) => {
    const p = byId.get(id)?.reportsToId;
    return p && byId.has(p) ? p : null;
  };

  const edges: OrgFlowEdge[] = users
    .filter((u) => parentOf(u.id))
    .map((u) => ({
      id: `${parentOf(u.id)}->${u.id}`,
      source: parentOf(u.id)!,
      target: u.id,
    }));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: NODE_SEP, ranksep: RANK_SEP });
  g.setDefaultEdgeLabel(() => ({}));
  for (const u of users) g.setNode(u.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: OrgFlowNode[] = users.map((u) => {
    // Dagre reports node centers; React Flow positions by top-left corner.
    const { x, y } = g.node(u.id);
    return {
      id: u.id,
      type: "orgNode",
      position: { x: x - NODE_W / 2, y: y - NODE_H / 2 },
      data: { name: u.fullName, role: u.role, team: u.team?.name ?? null },
    };
  });

  return { nodes, edges };
}

/** The org chart for the current active users, positioned server-side. */
export async function getOrgChart(): Promise<OrgChart> {
  const db = await getScopedPrisma();
  const users = await db.user.findMany({
    where: { isActive: true, showInOrgChart: true },
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
