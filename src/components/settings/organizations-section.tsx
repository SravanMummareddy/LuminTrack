"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import Link from "next/link";
import { Table, Th, Td } from "@/components/ui/table";
import { saveOrganization } from "@/server/actions/organizations";
import { formatOrganizationDisplayId } from "@/lib/format";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { OrganizationRow } from "@/server/queries/organizations";

export function OrganizationsSection({
  organizations,
  canManage,
  openEditId,
}: {
  organizations: OrganizationRow[];
  canManage: boolean;
  /** When set (from `?edit=<id>`), open that row's dialog on load. */
  openEditId?: string;
}) {
  const [editing, setEditing] = useState<OrganizationRow | "new" | null>(
    () =>
      openEditId
        ? organizations.find((o) => o.id === openEditId) ?? null
        : null,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">
            Organizations{" "}
            <span className="font-normal text-slate-400">
              ({organizations.length})
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Each organization is an isolated tenant — its jobs, candidates,
            submissions, and users are visible only within it.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add organization
          </Button>
        )}
      </div>

      <Table>
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <Th>ID</Th>
            <Th>Name</Th>
            <Th>Slug</Th>
            <Th>Users</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {organizations.map((o) => (
            <tr key={o.id}>
              <Td label="ID" className="font-mono text-xs text-slate-500">
                {formatOrganizationDisplayId(o)}
              </Td>
              <Td label="Name" className="font-medium text-slate-900">
                <Link href={`/settings/organization/${o.id}`} className="text-indigo-600 hover:underline">
                  {o.name}
                </Link>
                {o.isDefault && (
                  <Badge tone="slate" className="ml-2 align-middle">
                    Default
                  </Badge>
                )}
              </Td>
              <Td label="Slug" className="font-mono text-xs text-slate-500">
                {o.slug}
              </Td>
              <Td label="Users" className="text-slate-600">
                {o.userCount}
              </Td>
              <Td label="Status">
                <Badge tone={o.isActive ? "green" : "slate"}>
                  {o.isActive ? "Active" : "Inactive"}
                </Badge>
              </Td>
              <Td className="text-right">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditing(o)}
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
        title={editing === "new" ? "New organization" : "Edit organization"}
      >
        {editing !== null && (
          <OrganizationForm
            organization={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

/** Lowercase, hyphenate, strip anything that isn't a-z0-9 — the same shape the
 *  Zod slug rule accepts. Used to auto-fill the slug from the name until the
 *  user edits the slug directly. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function OrganizationForm({
  organization,
  onDone,
}: {
  organization: OrganizationRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveOrganization,
    EMPTY_FORM_STATE,
  );
  const [slug, setSlug] = useState(organization?.slug ?? "");
  // Once a new org's slug is hand-edited, stop auto-deriving it from the name.
  const slugTouched = useRef(organization !== null);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {organization && <input type="hidden" name="id" value={organization.id} />}

      <Field label="Name" htmlFor="org-name" required error={state.fieldErrors?.name}>
        <Input
          id="org-name"
          name="name"
          defaultValue={organization?.name ?? ""}
          required
          placeholder="Acme Staffing"
          onChange={(e) => {
            if (!slugTouched.current) setSlug(slugify(e.target.value));
          }}
        />
      </Field>

      <Field
        label="Slug"
        htmlFor="org-slug"
        required
        error={state.fieldErrors?.slug}
        hint="Url-safe key. Keep it stable — other data isn't affected, but people learn it."
      >
        <Input
          id="org-slug"
          name="slug"
          value={slug}
          required
          className="font-mono"
          placeholder="acme-staffing"
          onChange={(e) => {
            slugTouched.current = true;
            setSlug(e.target.value);
          }}
        />
      </Field>

      <label
        htmlFor="org-active"
        className="flex items-center gap-2 text-sm text-slate-700"
      >
        <input
          id="org-active"
          type="checkbox"
          name="isActive"
          defaultChecked={organization?.isActive ?? true}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
        />
        Active
      </label>

      {!organization && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Creating an organization provisions its Manager, Team Lead, and
          Recruiter system roles automatically.
        </p>
      )}

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
          {pending ? "Saving…" : "Save organization"}
        </Button>
      </div>
    </form>
  );
}
