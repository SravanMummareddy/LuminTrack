"use client";

import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { roleLabel } from "@/lib/permissions";
import type { OrgChart, OrgNodeData } from "@/server/queries/org-chart";
import type { UserRole } from "@/generated/prisma/enums";

type OrgNode = Node<OrgNodeData, "orgNode">;

// Tint each card by role tier so the hierarchy reads at a glance.
const ROLE_TINT: Record<UserRole, string> = {
  MANAGER: "border-indigo-300 bg-indigo-50",
  TEAM_LEAD: "border-sky-300 bg-sky-50",
  RECRUITER: "border-slate-300 bg-white",
};

function OrgNodeCard({ data }: NodeProps<OrgNode>) {
  return (
    <div
      className={`w-44 rounded-lg border px-3 py-2 shadow-sm ${ROLE_TINT[data.role]}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="truncate text-sm font-semibold text-slate-900">
        {data.name}
      </div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">
        {roleLabel(data.role)}
      </div>
      {data.team && (
        <div className="mt-0.5 truncate text-[11px] text-slate-400">{data.team}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

// Module scope — recreating this each render makes React Flow warn + remount.
const nodeTypes = { orgNode: OrgNodeCard };

export function OrgChartFlow({ nodes, edges }: OrgChart) {
  return (
    <div className="h-[70vh] w-full rounded-lg border border-slate-200 bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
