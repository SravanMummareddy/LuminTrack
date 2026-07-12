"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContactsDialog,
  type ContactRow,
} from "@/components/settings/contacts-dialog";
import type { ContactKind } from "@/lib/contact-kinds";

/** "Manage contacts" affordance on an org-entity detail page — opens the shared
 *  ContactsDialog for this Client/Vendor/Source. Managers only (the page gates). */
export function EntityContacts({
  kind,
  parentId,
  parentName,
  contacts,
}: {
  kind: ContactKind;
  parentId: string;
  parentName: string;
  contacts: ContactRow[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Manage contacts
      </Button>
      <ContactsDialog
        open={open}
        onClose={() => setOpen(false)}
        kind={kind}
        parentId={parentId}
        parentName={parentName}
        contacts={contacts}
        readOnly={false}
      />
    </>
  );
}
