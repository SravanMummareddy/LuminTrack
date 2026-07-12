"use client";

import { useActionState, useEffect, useState, startTransition } from "react";
import { Mail, Send } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { emailAssignedRecruiter } from "@/server/actions/requirements";
import { EMPTY_FORM_STATE } from "@/lib/form-state";

/**
 * Wave 7.1 — a team lead's "Email recruiter" control on the VPR detail page.
 * Two entry points render the SAME dialog via `variant`: the header toolbar
 * button and the compact link next to the recruiter's name.
 */
export function EmailRecruiterButton({
  requirementId,
  recruiterName,
  recruiterEmail,
  vprDisplayId,
  jobTitle,
  variant = "button",
}: {
  requirementId: string;
  recruiterName: string;
  recruiterEmail: string;
  vprDisplayId: string;
  jobTitle: string;
  variant?: "button" | "link";
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState(
    emailAssignedRecruiter,
    EMPTY_FORM_STATE,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && state.toast) {
      toast({ tone: "success", title: state.toast.title });
      setOpen(false);
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const initials =
    recruiterName
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClass("secondary", "sm")}
        >
          <Mail className="h-4 w-4" />
          Email recruiter
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"
        >
          <Mail className="h-3.5 w-3.5" />
          Email
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Email the assigned recruiter"
        description={`Send ${recruiterName} a note about ${vprDisplayId} — ${jobTitle}.`}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-green-50 px-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-green-700 text-xs font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-green-900">
                {recruiterName}
              </div>
              <div className="truncate font-mono text-xs text-green-800/80">
                {recruiterEmail}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="email-recruiter-note"
              className="mb-1.5 block text-xs font-semibold text-slate-600"
            >
              Add a message{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Textarea
              id="email-recruiter-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Priority — client wants 2 submissions by Friday."
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Your note is added to the templated assignment email.
            </p>
          </div>

          {state.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={buttonClass("secondary", "sm")}
            >
              Cancel
            </button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", requirementId);
                fd.set("note", note);
                startTransition(() => formAction(fd));
              }}
            >
              <Send className="h-4 w-4" />
              {pending ? "Sending…" : "Send email"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
