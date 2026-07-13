"use client";

import { useState, useTransition } from "react";
import { Check, UserRoundCheck } from "lucide-react";
import { markCandidateContacted } from "@/server/actions/candidates";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/**
 * Audit finding H3 (2026-05-26): the prior implementation was a plain
 * underlined-text submit button right next to the candidate name —
 * visually indistinguishable from a passive link, with no confirmation
 * and no feedback. Easy to mis-tap on a touch device. This restyles it
 * as a proper bordered button with an icon and a brief "Marked ✓"
 * pending/success state.
 */
export function MarkContactedButton({ candidateId }: { candidateId: string }) {
  const [pending, startTransition] = useTransition();
  const [justMarked, setJustMarked] = useState(false);
  const { toast } = useToast();

  function onClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", candidateId);
      try {
        await markCandidateContacted(fd);
        setJustMarked(true);
        setTimeout(() => setJustMarked(false), 2500);
      } catch {
        toast({ tone: "error", title: "Could not record contact" });
      }
    });
  }

  const label = justMarked ? "Marked" : pending ? "Marking…" : "Mark contacted";
  const Icon = justMarked ? Check : UserRoundCheck;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || justMarked}
      aria-label="Record that you just contacted this candidate"
      className={cn(buttonClass("secondary", "sm"), "gap-1.5")}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
