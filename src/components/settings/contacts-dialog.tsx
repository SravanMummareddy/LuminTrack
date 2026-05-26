"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { saveContact, deleteContact } from "@/server/actions/contacts";
import type { ContactKind } from "@/server/actions/contacts";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
};

/**
 * §B1 — manages the contact list for a single Client / Vendor / Source.
 * Renders the existing contacts plus an add/edit form. The parent settings
 * page revalidates after each save / delete so this stays a thin view.
 */
export function ContactsDialog({
  open,
  onClose,
  kind,
  parentId,
  parentName,
  contacts,
  readOnly,
}: {
  open: boolean;
  onClose: () => void;
  kind: ContactKind;
  parentId: string;
  parentName: string;
  contacts: ContactRow[];
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);

  // Reset the inline form when the dialog re-opens for a different entity.
  useEffect(() => {
    if (!open) setEditing(null);
  }, [open, parentId]);

  return (
    <Dialog open={open} onClose={onClose} title={`Contacts · ${parentName}`}>
      <div className="space-y-3">
        {contacts.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No contacts yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    {c.isPrimary ? (
                      <Badge tone="indigo">
                        <Star className="mr-1 h-3 w-3" aria-hidden /> Primary
                      </Badge>
                    ) : null}
                    {c.role ? (
                      <span className="text-xs text-slate-500">{c.role}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(c)}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Edit
                    </button>
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        title="Delete contact"
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {!readOnly && editing === null && (
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        )}

        {!readOnly && editing !== null && (
          <ContactForm
            key={editing === "new" ? "new" : editing.id}
            kind={kind}
            parentId={parentId}
            contact={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}

        {readOnly && (
          <p className="text-xs text-slate-400">
            Only admins can add or edit contacts.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function ContactForm({
  kind,
  parentId,
  contact,
  onDone,
}: {
  kind: ContactKind;
  parentId: string;
  contact: ContactRow | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    saveContact,
    EMPTY_FORM_STATE,
  );

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-slate-200 bg-slate-50/50 p-3"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="parentId" value={parentId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}

      <Field
        label="Name"
        htmlFor="contact-name"
        required
        error={state.fieldErrors?.name}
      >
        <Input
          id="contact-name"
          name="name"
          defaultValue={contact?.name ?? ""}
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Email"
          htmlFor="contact-email"
          error={state.fieldErrors?.email}
        >
          <Input
            id="contact-email"
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </Field>
        <Field
          label="Phone"
          htmlFor="contact-phone"
          error={state.fieldErrors?.phone}
        >
          <Input
            id="contact-phone"
            name="phone"
            defaultValue={contact?.phone ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Role"
        htmlFor="contact-role"
        hint="e.g. Hiring manager, AP, Recruiter contact"
        error={state.fieldErrors?.role}
      >
        <Input
          id="contact-role"
          name="role"
          defaultValue={contact?.role ?? ""}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isPrimary"
          defaultChecked={contact?.isPrimary ?? false}
          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-200"
        />
        Primary contact (others on this {kind} get demoted)
      </label>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
