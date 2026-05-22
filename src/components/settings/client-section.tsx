"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import { saveClient } from "@/server/actions/org";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export type ClientRow = {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  isActive: boolean;
};

export function ClientSection({ items }: { items: ClientRow[] }) {
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Clients <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          Add client
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No clients yet.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <Td className="font-medium text-slate-900">{item.name}</Td>
                <Td>{item.location || "—"}</Td>
                <Td>
                  <Badge tone={item.isActive ? "green" : "slate"}>
                    {item.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Edit
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add client" : "Edit client"}
      >
        {editing !== null && (
          <ClientForm
            entity={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function ClientForm({
  entity,
  onDone,
}: {
  entity: ClientRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveClient, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {entity && <input type="hidden" name="id" value={entity.id} />}

      <Field label="Client name" htmlFor="name" required error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={entity?.name ?? ""} required />
      </Field>

      <Field label="Location" htmlFor="location" error={state.fieldErrors?.location}>
        <Input id="location" name="location" defaultValue={entity?.location ?? ""} />
      </Field>

      <Field label="Notes" htmlFor="notes" error={state.fieldErrors?.notes}>
        <Textarea id="notes" name="notes" rows={3} defaultValue={entity?.notes ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={entity?.isActive ?? true}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
        />
        Active
      </label>

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
