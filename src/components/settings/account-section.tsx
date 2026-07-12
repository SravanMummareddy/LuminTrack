"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, Eye, EyeOff, User, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import { useToast } from "@/components/ui/toast";
import {
  changeOwnPassword,
  updateOwnProfile,
  updateOwnNotifications,
} from "@/server/actions/users";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

export function AccountSection({
  fullName,
  email,
  notifyDigest,
  notifyEvents,
}: {
  fullName: string;
  email: string;
  notifyDigest: boolean;
  notifyEvents: boolean;
}) {
  // Remount the password form on success so the (uncontrolled) inputs clear —
  // React 19 doesn't auto-reset a form after a server action resolves.
  const [formKey, setFormKey] = useState(0);
  return (
    <div className="space-y-8">
      <ProfileForm fullName={fullName} email={email} />
      <NotificationsForm notifyDigest={notifyDigest} notifyEvents={notifyEvents} />
      <PasswordForm key={formKey} onDone={() => setFormKey((k) => k + 1)} />
    </div>
  );
}

function NotificationsForm({
  notifyDigest,
  notifyEvents,
}: {
  notifyDigest: boolean;
  notifyEvents: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateOwnNotifications,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();
  useEffect(() => {
    if (state.ok)
      toast({ tone: "success", title: state.toast?.title ?? "Preferences saved" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <section className="max-w-md space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Bell className="h-4 w-4 text-slate-400" />
          Email notifications
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Control which emails LuminTrack sends you.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="notifyDigest"
            defaultChecked={notifyDigest}
            className="mt-0.5 h-4 w-4 accent-green-600"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">
              Daily digest
            </span>
            <span className="block text-xs text-slate-500">
              One weekday-morning email with your pending action items. Nothing
              sent on empty days.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="notifyEvents"
            defaultChecked={notifyEvents}
            className="mt-0.5 h-4 w-4 accent-green-600"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">
              Immediate emails
            </span>
            <span className="block text-xs text-slate-500">
              Sent as they happen — e.g. a new submission on a requirement you
              lead.
            </span>
          </span>
        </label>

        <div className="pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ProfileForm({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateOwnProfile,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();
  useEffect(() => {
    if (state.ok)
      toast({ tone: "success", title: state.toast?.title ?? "Profile updated" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <section className="max-w-md space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <User className="h-4 w-4 text-slate-400" />
          Profile
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Your name and the email you sign in with.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        <Field
          label="Full name"
          htmlFor="profile-fullName"
          required
          error={state.fieldErrors?.fullName}
        >
          <Input
            id="profile-fullName"
            name="fullName"
            defaultValue={fullName}
            required
          />
        </Field>
        <Field
          label="Email"
          htmlFor="profile-email"
          required
          error={state.fieldErrors?.email}
        >
          <Input
            id="profile-email"
            name="email"
            type="email"
            defaultValue={email}
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
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    changeOwnPassword,
    EMPTY_FORM_STATE,
  );
  const [newPassword, setNewPassword] = useState("");
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
          error={state.fieldErrors?.newPassword}
        >
          <PasswordInput
            id="newPassword"
            name="newPassword"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <PasswordRequirements value={newPassword} />
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
