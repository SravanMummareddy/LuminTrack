"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import { saveUser } from "@/server/actions/users";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN" | "RECRUITER";
  isActive: boolean;
};

export function UserSection({
  items,
  canManage,
}: {
  items: UserRow[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Users <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Only administrators can add or edit users.
        </p>
      )}

      <Table>
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id}>
              <Td className="font-medium text-slate-900">{item.fullName}</Td>
              <Td>{item.email}</Td>
              <Td>
                <Badge tone={item.role === "ADMIN" ? "indigo" : "slate"}>
                  {item.role === "ADMIN" ? "Administrator" : "Recruiter"}
                </Badge>
              </Td>
              <Td>
                <Badge tone={item.isActive ? "green" : "slate"}>
                  {item.isActive ? "Active" : "Inactive"}
                </Badge>
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

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add user" : "Edit user"}
      >
        {editing !== null && (
          <UserForm
            entity={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function UserForm({
  entity,
  onDone,
}: {
  entity: UserRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveUser, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {entity && <input type="hidden" name="id" value={entity.id} />}

      <Field label="Full name" htmlFor="fullName" required error={state.fieldErrors?.fullName}>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={entity?.fullName ?? ""}
          required
        />
      </Field>

      <Field label="Email" htmlFor="email" required error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={entity?.email ?? ""}
          required
        />
      </Field>

      <Field label="Role" htmlFor="role" required error={state.fieldErrors?.role}>
        <Select id="role" name="role" defaultValue={entity?.role ?? "RECRUITER"}>
          <option value="RECRUITER">Recruiter</option>
          <option value="ADMIN">Administrator</option>
        </Select>
      </Field>

      <Field
        label={entity ? "New password" : "Password"}
        htmlFor="password"
        required={!entity}
        error={state.fieldErrors?.password}
        hint={
          entity
            ? "Leave blank to keep the current password."
            : "Minimum 8 characters."
        }
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required={!entity}
        />
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
