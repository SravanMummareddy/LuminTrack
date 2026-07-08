"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Arms the browser's native "Leave site?" prompt while `dirty` is true. This is
 * the ONLY way to intercept a tab close, refresh, or hard navigation away — the
 * browser owns that dialog and its text can't be customized (a security rule so
 * pages can't trap you). In-app soft navigation (clicking Cancel / a link) does
 * NOT fire `beforeunload`; use <GuardedCancel> for the Cancel button, which
 * shows the app's own branded confirm instead.
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy Chrome/Firefox require a returnValue to trigger the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}

/**
 * A drop-in replacement for the forms' Cancel `<Link>`. When the form is dirty
 * it first asks to discard via the branded ConfirmDialog; when clean it just
 * navigates. Looks identical to the old secondary-styled link.
 */
export function GuardedCancel({
  href,
  dirty,
  children = "Cancel",
  className,
}: {
  href: string;
  dirty: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className ?? buttonClass("secondary")}
        onClick={() => (dirty ? setOpen(true) : router.push(href))}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          router.push(href);
        }}
        title="Discard changes?"
        description="You have unsaved changes on this form. Leaving now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
      />
    </>
  );
}

/**
 * A dirty-aware in-form link (e.g. "View candidate" on the bench edit form).
 * Soft navigation doesn't fire `beforeunload`, so a plain <Link> silently drops
 * unsaved edits — this asks to discard first when the form is dirty, else it
 * navigates straight through. Renders as a text link, not a button.
 */
export function GuardedLink({
  href,
  dirty,
  children,
  className = "text-indigo-600 hover:underline",
}: {
  href: string;
  dirty: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => (dirty ? setOpen(true) : router.push(href))}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          router.push(href);
        }}
        title="Discard changes?"
        description="You have unsaved changes on this form. Leaving now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
      />
    </>
  );
}
