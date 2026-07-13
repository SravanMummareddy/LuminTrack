"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import { saveTeam } from "@/server/actions/org";
import { formatTeamDisplayId } from "@/lib/format";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export type TeamRow = {
  id: string;
  seq: number;
  name: string;
  leadId: string | null;
  lead: { fullName: string } | null;
  _count: { members: number };
};

type Option = { id: string; fullName: string };

export function TeamSection({
  items,
  canManage,
  leadOptions,
}: {
  items: TeamRow[];
  canManage: boolean;
  /** Team-lead (+ manager) users eligible to lead a team. */
  leadOptions: Option[];
}) {
  const [editing, setEditing] = useState<TeamRow | "new" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Teams <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add team
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Only managers can add or edit teams.
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No teams yet.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>ID</Th>
              <Th>Team</Th>
              <Th>Lead</Th>
              <Th>Members</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <Td label="ID" className="font-mono text-xs text-slate-500">
                  {formatTeamDisplayId(item)}
                </Td>
                <Td label="Team" className="font-medium text-slate-900">
                  <Link href={`/settings/team/${item.id}`} className="text-indigo-600 hover:underline">
                    {item.name}
                  </Link>
                </Td>
                <Td label="Lead" className="text-slate-600">
                  {item.lead?.fullName ?? <span className="text-slate-300">—</span>}
                </Td>
                <Td label="Members" className="tabular-nums text-slate-600">
                  {item._count.members}
                </Td>
                <Td className="text-right">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Edit
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add team" : "Edit team"}
      >
        {editing !== null && (
          <TeamForm
            entity={editing === "new" ? null : editing}
            leadOptions={leadOptions}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function TeamForm({
  entity,
  leadOptions,
  onDone,
}: {
  entity: TeamRow | null;
  leadOptions: Option[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveTeam, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {entity && <input type="hidden" name="id" value={entity.id} />}

      <Field label="Team name" htmlFor="name" required error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={entity?.name ?? ""} required />
      </Field>

      <Field label="Team lead" htmlFor="leadId" error={state.fieldErrors?.leadId}>
        <Select id="leadId" name="leadId" defaultValue={entity?.leadId ?? ""}>
          <option value="">— No lead —</option>
          {leadOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
      </Field>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
