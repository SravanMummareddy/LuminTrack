"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Branded confirmation modal, replacing native `window.confirm` (un-styled,
 * jarring, and inconsistent with the rest of the app). Controlled: the caller
 * owns `open` and supplies `onConfirm` / `onClose`.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={tone} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * A destructive action expressed as a Server-Action `<form>`, gated behind a
 * branded confirm. The trigger is a plain button (`type="button"`) that opens
 * the dialog; confirming calls `form.requestSubmit()`, which runs the same
 * Server Action a real submit would. Replaces the
 * `<form><button onClick={e => !confirm() && e.preventDefault()}>` pattern.
 */
export function ConfirmSubmit({
  action,
  fields = {},
  title,
  description,
  confirmLabel = "Delete",
  tone = "danger",
  trigger,
  triggerClassName,
  triggerTitle,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** Hidden inputs to include in the form (e.g. `{ id }`). */
  fields?: Record<string, string>;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <form ref={formRef} action={action}>
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="button"
          title={triggerTitle}
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          {trigger}
        </button>
      </form>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          formRef.current?.requestSubmit();
        }}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        tone={tone}
      />
    </>
  );
}
