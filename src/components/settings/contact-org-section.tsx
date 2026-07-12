"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SuggestInput } from "@/components/ui/suggest-input";
import { Table, Th, Td } from "@/components/ui/table";
import {
  SettingsListFilter,
  type StatusFilter,
} from "@/components/settings/settings-list-filter";
import { useLocalPagination } from "@/components/ui/local-pager";
import {
  ContactsDialog,
  type ContactRow,
} from "@/components/settings/contacts-dialog";
import type { ContactKind } from "@/lib/contact-kinds";
import { AuditCell, type AuditFields } from "@/components/settings/audit-cell";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/form-state";

export type ContactOrg = AuditFields & {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  contacts: ContactRow[];
  // Vendors only: the owning team member. `recruitedBy` is the linked user;
  // `recruitedByName` is the free-text fallback when nobody is linked.
  recruitedBy?: { fullName: string } | null;
  recruitedByName?: string | null;
};

/** Display label for a vendor's "Recruited by" — the linked user's name, else
 *  the free-typed name, else null. */
function recruitedByLabel(org: ContactOrg): string | null {
  return org.recruitedBy?.fullName ?? org.recruitedByName ?? null;
}

type SaveAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Settings table for the two contact-style org entities: sources and vendors. */
export function ContactOrgSection({
  title,
  singular,
  items,
  action,
  contactKind,
  isAdmin,
  showRecruitedBy = false,
  userNames = [],
}: {
  title: string;
  singular: string;
  items: ContactOrg[];
  action: SaveAction;
  contactKind: ContactKind;
  isAdmin: boolean;
  /** Vendors only — reveal the "Recruited by" column + form field. */
  showRecruitedBy?: boolean;
  /** Active user names that seed the "Recruited by" suggestion list. */
  userNames?: string[];
}) {
  const [editing, setEditing] = useState<ContactOrg | "new" | null>(null);
  const [contactsOf, setContactsOf] = useState<ContactOrg | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

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
          {title}{" "}
          <span className="font-normal text-slate-400">({items.length})</span>
        </h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add {singular}
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <SettingsListFilter
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          searchPlaceholder={`Search ${title.toLowerCase()}…`}
        />
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No {title.toLowerCase()} yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-400">
          No {title.toLowerCase()} match these filters.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>Name</Th>
              <Th>Contact</Th>
              {showRecruitedBy && <Th>Recruited by</Th>}
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Location</Th>
              <Th>Status</Th>
              <Th>Contacts</Th>
              <Th>Added / Updated</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageItems.map((item) => (
              <tr key={item.id}>
                <Td label="Name" className="font-medium text-slate-900">
                  {item.name}
                </Td>
                <Td label="Contact">{item.contactPerson || "—"}</Td>
                {showRecruitedBy && (
                  <Td label="Recruited by">{recruitedByLabel(item) || "—"}</Td>
                )}
                <Td label="Email">{item.email || "—"}</Td>
                <Td label="Phone">{item.phone || "—"}</Td>
                <Td label="Location">{item.location || "—"}</Td>
                <Td label="Status">
                  <Badge tone={item.isActive ? "green" : "slate"}>
                    {item.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td label="Contacts">
                  <button
                    type="button"
                    onClick={() => setContactsOf(item)}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    Manage ({item.contacts.length})
                  </button>
                </Td>
                <Td label="Added / Updated">
                  <AuditCell {...item} />
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
        title={editing === "new" ? `Add ${singular}` : `Edit ${singular}`}
      >
        {editing !== null && (
          <ContactOrgForm
            action={action}
            entity={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
            showRecruitedBy={showRecruitedBy}
            userNames={userNames}
          />
        )}
      </Dialog>

      <ContactsDialog
        open={contactsOf !== null}
        onClose={() => setContactsOf(null)}
        kind={contactKind}
        parentId={contactsOf?.id ?? ""}
        parentName={contactsOf?.name ?? ""}
        contacts={contactsOf?.contacts ?? []}
        readOnly={!isAdmin}
      />
    </section>
  );
}

function ContactOrgForm({
  action,
  entity,
  onDone,
  showRecruitedBy,
  userNames,
}: {
  action: SaveAction;
  entity: ContactOrg | null;
  onDone: () => void;
  showRecruitedBy: boolean;
  userNames: string[];
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {entity && <input type="hidden" name="id" value={entity.id} />}

      <Field label="Name" htmlFor="name" required error={state.fieldErrors?.name}>
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

      {showRecruitedBy && (
        <Field
          label="Recruited by"
          htmlFor="recruitedBy"
          hint="Your team member who owns this vendor. Auto-fills the Vendor recruiter on every VPR for this vendor. Pick a name or type one."
        >
          <SuggestInput
            id="recruitedBy"
            name="recruitedBy"
            defaultValue={entity ? recruitedByLabel(entity) ?? "" : ""}
            suggestions={userNames}
            maxResults={userNames.length}
            placeholder="Sriman Udugula"
          />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={entity?.email ?? ""}
          />
        </Field>
        <Field label="Phone" htmlFor="phone" error={state.fieldErrors?.phone}>
          <Input id="phone" name="phone" defaultValue={entity?.phone ?? ""} />
        </Field>
      </div>

      <Field label="Location" htmlFor="location" error={state.fieldErrors?.location}>
        <Input
          id="location"
          name="location"
          defaultValue={entity?.location ?? ""}
        />
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
