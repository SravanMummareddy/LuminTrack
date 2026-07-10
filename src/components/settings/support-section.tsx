"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
import { saveSupportProvider } from "@/server/actions/support";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import type { SupportProviderRow } from "@/server/queries/support";

/** Settings table for external interview-support individuals. */
export function SupportSection({
  items,
  isAdmin,
}: {
  items: SupportProviderRow[];
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState<SupportProviderRow | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (status === "active" && !it.isActive) return false;
      if (status === "inactive" && it.isActive) return false;
      if (
        q &&
        !it.name.toLowerCase().includes(q) &&
        !it.skills.some((s) => s.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [items, search, status]);

  const { pageItems, pager } = useLocalPagination(filtered, 10);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Support providers{" "}
          <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add support provider
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        External individuals who assist a candidate during an interview. Recruiters
        can find one by skill here and reach out.
      </p>

      {items.length > 0 && (
        <SettingsListFilter
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          searchPlaceholder="Search name or skill…"
        />
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No support providers yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No support providers match these filters.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
              <Th>Skills</Th>
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((item) => (
              <tr key={item.id}>
                <Td label="Name" className="font-medium text-slate-900">
                  {item.name}
                </Td>
                <Td label="Phone">{item.phone || "—"}</Td>
                <Td label="Email">{item.email || "—"}</Td>
                <Td label="Skills">
                  {item.skills.length ? (
                    <span className="flex flex-wrap gap-1">
                      {item.skills.slice(0, 4).map((s) => (
                        <Badge key={s} tone="slate">
                          {s}
                        </Badge>
                      ))}
                      {item.skills.length > 4 && (
                        <span
                          className="text-xs text-slate-400"
                          title={item.skills.join(", ")}
                        >
                          +{item.skills.length - 4}
                        </span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td label="Reference">{item.reference || "—"}</Td>
                <Td label="Status">
                  <Badge tone={item.isActive ? "green" : "slate"}>
                    {item.isActive ? "Active" : "Inactive"}
                  </Badge>
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
        title={editing === "new" ? "Add support provider" : "Edit support provider"}
      >
        {editing !== null && (
          <SupportProviderForm
            provider={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function SupportProviderForm({
  provider,
  onDone,
}: {
  provider: SupportProviderRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveSupportProvider,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {provider && <input type="hidden" name="id" value={provider.id} />}

      <Field label="Name" htmlFor="name" required error={state.fieldErrors?.name}>
        <Input id="name" name="name" defaultValue={provider?.name ?? ""} required />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone}>
          <Input id="phone" name="phone" defaultValue={provider?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={provider?.email ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Skills"
        htmlFor="skills"
        hint="Comma-separated (e.g. Java, Spring, AWS) — used to find the right supporter."
        error={state.fieldErrors?.skills}
      >
        <Input
          id="skills"
          name="skills"
          defaultValue={provider?.skills.join(", ") ?? ""}
          placeholder="Java, Spring, AWS"
        />
      </Field>

      <Field
        label="Reference"
        htmlFor="reference"
        hint="Who referred this person."
        error={state.fieldErrors?.reference}
      >
        <Input
          id="reference"
          name="reference"
          defaultValue={provider?.reference ?? ""}
        />
      </Field>

      <Field label="Note" htmlFor="notes" error={state.fieldErrors?.notes}>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={provider?.notes ?? ""}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={provider?.isActive ?? true}
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
