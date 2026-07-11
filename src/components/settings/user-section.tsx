"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import { Table, Th, Td } from "@/components/ui/table";
import {
  SettingsListFilter,
  type StatusFilter,
} from "@/components/settings/settings-list-filter";
import { saveUser } from "@/server/actions/users";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { roleLabel } from "@/lib/permissions";
import type { UserRole } from "@/generated/prisma/enums";
import type { RoleOption } from "@/server/queries/roles";

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roleId: string | null;
  roleName: string | null;
  isActive: boolean;
  showInOrgChart: boolean;
  teamId: string | null;
  teamName: string | null;
  reportsToId: string | null;
};

type Option = { id: string; fullName: string };

export function UserSection({
  items,
  canManage,
  canGrantManager,
  teams,
  userOptions,
  roleOptions,
}: {
  items: UserRow[];
  canManage: boolean;
  /** Only a Manager may grant the Manager role or edit a Manager's account. */
  canGrantManager: boolean;
  /** Named teams for the "Team" picker. */
  teams: { id: string; name: string }[];
  /** Active users for the "Reports to" picker. */
  userOptions: Option[];
  /** Roles for the "Role" picker (from the RBAC roles table). */
  roleOptions: RoleOption[];
}) {
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (status === "active" && !it.isActive) return false;
      if (status === "inactive" && it.isActive) return false;
      if (
        q &&
        !it.fullName.toLowerCase().includes(q) &&
        !it.email.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, search, status]);

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
          Only managers and team leads can add or edit users.
        </p>
      )}

      {items.length > 0 && (
        <SettingsListFilter
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          searchPlaceholder="Search by name or email…"
        />
      )}

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No users match these filters.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Team</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <tr key={item.id}>
                <Td label="Name" className="font-medium text-slate-900">
                  {item.fullName}
                </Td>
                <Td label="Email">{item.email}</Td>
                <Td label="Role">
                  <Badge tone={item.role === "RECRUITER" ? "slate" : "indigo"}>
                    {item.roleName ?? roleLabel(item.role)}
                  </Badge>
                </Td>
                <Td label="Team" className="text-slate-600">
                  {item.teamName ?? <span className="text-slate-300">—</span>}
                </Td>
                <Td label="Status">
                  <Badge tone={item.isActive ? "green" : "slate"}>
                    {item.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  {canManage &&
                    (item.role !== "MANAGER" || canGrantManager) && (
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
        title={editing === "new" ? "Add user" : "Edit user"}
      >
        {editing !== null && (
          <UserForm
            entity={editing === "new" ? null : editing}
            canGrantManager={canGrantManager}
            teams={teams}
            userOptions={userOptions}
            roleOptions={roleOptions}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function UserForm({
  entity,
  canGrantManager,
  teams,
  userOptions,
  roleOptions,
  onDone,
}: {
  entity: UserRow | null;
  canGrantManager: boolean;
  teams: { id: string; name: string }[];
  userOptions: Option[];
  roleOptions: RoleOption[];
  onDone: () => void;
}) {
  // Manager-tier roles are only assignable by someone who can grant them.
  const assignableRoles = roleOptions.filter(
    (r) => canGrantManager || !r.isManagerTier,
  );
  const defaultRoleId =
    entity?.roleId ??
    assignableRoles.find((r) => r.name === "Recruiter")?.id ??
    assignableRoles[0]?.id ??
    "";
  const [state, formAction, pending] = useActionState(saveUser, EMPTY_FORM_STATE);
  const [password, setPassword] = useState("");

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

      <Field label="Role" htmlFor="roleId" required error={state.fieldErrors?.roleId}>
        <Select id="roleId" name="roleId" defaultValue={defaultRoleId}>
          {assignableRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Team"
        htmlFor="teamId"
        hint="Managers sit above teams — leave blank for them."
      >
        <Select id="teamId" name="teamId" defaultValue={entity?.teamId ?? ""}>
          <option value="">— No team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Reports to"
        htmlFor="reportsToId"
        hint="Leave blank to default to the team's lead."
      >
        <Select
          id="reportsToId"
          name="reportsToId"
          defaultValue={entity?.reportsToId ?? ""}
        >
          <option value="">— Auto / none —</option>
          {userOptions
            .filter((u) => u.id !== entity?.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
        </Select>
      </Field>

      <Field
        label={entity ? "New password" : "Password"}
        htmlFor="password"
        required={!entity}
        error={state.fieldErrors?.password}
        hint={
          entity ? "Leave blank to keep the current password." : undefined
        }
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!entity}
        />
        {/* On edit the field is optional, so only nudge once they start typing;
            on create show the checklist up front. */}
        {(!entity || password.length > 0) && (
          <PasswordRequirements value={password} />
        )}
      </Field>

      <label
        htmlFor="user-isActive"
        className="flex items-center gap-2 text-sm font-medium text-slate-700"
      >
        <input
          id="user-isActive"
          type="checkbox"
          name="isActive"
          defaultChecked={entity?.isActive ?? true}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
        />
        Active
      </label>

      <label
        htmlFor="user-showInOrgChart"
        className="flex items-start gap-2 text-sm font-medium text-slate-700"
      >
        <input
          id="user-showInOrgChart"
          type="checkbox"
          name="showInOrgChart"
          defaultChecked={entity?.showInOrgChart ?? true}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
        />
        <span>
          Show in org chart
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            Uncheck for owners/overseers who see everything but sit outside the
            reporting hierarchy.
          </span>
        </span>
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
