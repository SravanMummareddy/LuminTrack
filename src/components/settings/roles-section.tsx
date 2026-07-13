"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { Table, Th, Td } from "@/components/ui/table";
import { formatRoleDisplayId } from "@/lib/format";
import { saveRole, deleteRole } from "@/server/actions/roles";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import {
  PERMISSION_CATALOG,
  CATEGORY_LABEL,
  type PermissionCategory,
} from "@/lib/permission-catalog";
import type { RoleRow } from "@/server/queries/roles";

// Catalog grouped by category, in catalog order — shared by every role editor.
const GROUPED = PERMISSION_CATALOG.reduce(
  (acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  },
  {} as Record<PermissionCategory, (typeof PERMISSION_CATALOG)[number][]>,
);

export function RolesSection({
  roles,
  canManage,
}: {
  roles: RoleRow[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">
            Roles <span className="font-normal text-slate-400">({roles.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Compose what each role can do. Assign roles to people on the Users tab.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            New role
          </Button>
        )}
      </div>

      <Table>
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <Th>ID</Th>
            <Th>Role</Th>
            <Th>Permissions</Th>
            <Th>Users</Th>
            <Th>Type</Th>
            <Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {roles.map((r) => (
            <tr key={r.id}>
              <Td label="ID" className="font-mono text-xs text-slate-500">
                {formatRoleDisplayId(r)}
              </Td>
              <Td label="Role" className="font-medium text-slate-900">
                <Link href={`/settings/role/${r.id}`} className="text-indigo-600 hover:underline">
                  {r.name}
                </Link>
                {r.description && (
                  <div className="text-xs font-normal text-slate-400">
                    {r.description}
                  </div>
                )}
              </Td>
              <Td label="Permissions" className="text-slate-600">
                {r.permissionKeys.length}
              </Td>
              <Td label="Users" className="text-slate-600">
                {r.userCount}
              </Td>
              <Td label="Type">
                <Badge tone={r.isSystem ? "slate" : "indigo"}>
                  {r.isSystem ? "System" : "Custom"}
                </Badge>
              </Td>
              <Td className="text-right">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing(r)}
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
        title={editing === "new" ? "New role" : "Edit role"}
      >
        {editing !== null && (
          <RoleForm
            role={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function RoleForm({
  role,
  onDone,
}: {
  role: RoleRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveRole, EMPTY_FORM_STATE);
  const [del, delAction, delPending] = useActionState(
    deleteRole,
    EMPTY_FORM_STATE,
  );
  const granted = useMemo(
    () => new Set(role?.permissionKeys ?? []),
    [role?.permissionKeys],
  );
  const isSystem = role?.isSystem ?? false;

  useEffect(() => {
    if (state.ok || del.ok) onDone();
  }, [state.ok, del.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {role && <input type="hidden" name="id" value={role.id} />}

      <Field
        label="Name"
        htmlFor="role-name"
        required
        error={state.fieldErrors?.name}
        hint={isSystem ? "System roles can't be renamed." : undefined}
      >
        <Input
          id="role-name"
          name="name"
          defaultValue={role?.name ?? ""}
          required
          disabled={isSystem}
        />
      </Field>

      <Field label="Description" htmlFor="role-desc" error={state.fieldErrors?.description}>
        <Input
          id="role-desc"
          name="description"
          defaultValue={role?.description ?? ""}
          placeholder="What this role is for"
        />
      </Field>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Permissions</p>
        <p className="mb-2 text-xs text-slate-500">
          Tick what this role can do.
        </p>
        <div className="space-y-3">
          {(Object.keys(GROUPED) as PermissionCategory[]).map((cat) => (
            <fieldset key={cat} className="rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {CATEGORY_LABEL[cat]}
              </legend>
              <div className="space-y-2">
                {GROUPED[cat].map((p) => (
                  <label
                    key={p.key}
                    htmlFor={`perm-${p.key}`}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <input
                      id={`perm-${p.key}`}
                      type="checkbox"
                      name="permissions"
                      value={p.key}
                      defaultChecked={granted.has(p.key)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
                    />
                    <span>
                      {p.label}
                      <span className="mt-0.5 block text-xs font-normal text-slate-400">
                        {p.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      {(state.error || del.error) && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error || del.error}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        {role && !isSystem ? (
          <button
            type="submit"
            formAction={delAction}
            disabled={delPending}
            className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-800"
          >
            <Trash2 className="h-4 w-4" />
            Delete role
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save role"}
          </Button>
        </div>
      </div>
    </form>
  );
}
