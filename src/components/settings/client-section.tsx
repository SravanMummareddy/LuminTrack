"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import {
  SettingsListFilter,
  type StatusFilter,
} from "@/components/settings/settings-list-filter";
import { useLocalPagination } from "@/components/ui/local-pager";
import { saveClient } from "@/server/actions/org";
import { formatClientDisplayId } from "@/lib/format";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export type ClientRow = {
  id: string;
  seq: number;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  _count: { jobs: number };
};

export function ClientSection({
  items,
  isAdmin,
  openEditId,
}: {
  items: ClientRow[];
  isAdmin: boolean;
  /** When set (from `?edit=<id>`), open that row's edit dialog on load. */
  openEditId?: string;
}) {
  const [editing, setEditing] = useState<ClientRow | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    if (openEditId) {
      const row = items.find((i) => i.id === openEditId);
      if (row) setEditing(row);
    }
  }, [openEditId, items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (status === "active" && !it.isActive) return false;
      if (status === "inactive" && it.isActive) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, status]);

  const { pageItems, pager } = useLocalPagination(filtered, 10);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Clients <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add client
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <SettingsListFilter
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          searchPlaceholder="Search clients…"
        />
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No clients yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No clients match these filters.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>ID</Th>
              <Th>Contact</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Jobs</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((item) => (
              <tr key={item.id}>
                <Td label="Name">
                  <Link
                    href={`/settings/client/${item.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {item.name}
                  </Link>
                </Td>
                <Td label="ID" className="font-mono text-xs text-slate-500">
                  {formatClientDisplayId(item)}
                </Td>
                <Td label="Contact">{item.contactPerson || "—"}</Td>
                <Td label="Email">{item.email || "—"}</Td>
                <Td label="Phone">{item.phone || "—"}</Td>
                <Td label="Status">
                  <Badge tone={item.isActive ? "green" : "slate"}>
                    {item.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td label="Jobs" className="tabular-nums text-slate-600">
                  {item._count.jobs}
                </Td>
                <Td className="text-right">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      Edit
                    </button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {filtered.length > 0 && pager}

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

      <Field
        label="Contact person"
        htmlFor="contactPerson"
        error={state.fieldErrors?.contactPerson}
      >
        <Input
          id="contactPerson"
          name="contactPerson"
          defaultValue={entity?.contactPerson ?? ""}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" defaultValue={entity?.email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone}>
          <Input id="phone" name="phone" defaultValue={entity?.phone ?? ""} />
        </Field>
      </div>

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
