"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { changeOwnPassword } from "@/server/actions/users";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export function AccountSection() {
  // Remount the form on success so the (uncontrolled) password inputs clear —
  // React 19 doesn't auto-reset a form after a server action resolves.
  const [formKey, setFormKey] = useState(0);
  return (
    <PasswordForm key={formKey} onDone={() => setFormKey((k) => k + 1)} />
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    changeOwnPassword,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) {
      toast({ tone: "success", title: state.toast?.title ?? "Password updated" });
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <section className="max-w-md space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Lock className="h-4 w-4 text-slate-400" />
          Change password
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Update the password you use to sign in.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Field
          label="Current password"
          htmlFor="currentPassword"
          required
          error={state.fieldErrors?.currentPassword}
        >
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          required
          hint="At least 8 characters."
          error={state.fieldErrors?.newPassword}
        >
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            required
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          required
          error={state.fieldErrors?.confirmPassword}
        >
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
          />
        </Field>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div className="pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        className={`pr-10 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
