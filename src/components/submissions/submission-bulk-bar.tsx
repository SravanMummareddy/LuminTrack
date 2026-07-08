"use client";

import { useState, useTransition } from "react";
import { PauseCircle, XCircle, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  STATUS_CHANGE_REASONS,
  STATUS_CHANGE_REASON_LABEL,
  SUBMISSION_STATUS_LABEL,
} from "@/lib/labels";
import { bulkChangeSubmissionStatus } from "@/server/actions/submissions";

// Only the safe branch outcomes are offered in bulk — advancing / marking joined
// stays per-submission (gates + placement cascade). Mirror the server's
// BULK_STATUS_TARGETS. `confirm` gates the destructive outcomes behind a dialog;
// `hasReason` sends the preset reason category (Hold / Reject only).
const TARGETS = [
  { status: "ON_HOLD", label: "Hold", icon: PauseCircle, hasReason: true, confirm: false },
  { status: "REJECTED", label: "Reject", icon: XCircle, hasReason: true, confirm: true },
  { status: "BACKED_OUT", label: "Backed out", icon: UserMinus, hasReason: false, confirm: true },
] as const;

type Target = (typeof TARGETS)[number];

export function SubmissionBulkBar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState<Target | null>(null);
  const { toast } = useToast();
  const n = selectedIds.length;

  function apply(target: Target) {
    const status = target.status;
    const label = SUBMISSION_STATUS_LABEL[status];
    const fd = new FormData();
    for (const id of selectedIds) fd.append("ids", id);
    fd.set("status", status);
    if (target.hasReason && reason) fd.set("reason", reason);
    startTransition(async () => {
      const { changed, skipped } = await bulkChangeSubmissionStatus(fd);
      if (changed === 0) {
        toast({
          tone: "error",
          title: `Nothing changed`,
          description: `None of the ${n} selected could move to ${label} (already closed or joined).`,
        });
      } else {
        toast({
          tone: "success",
          title: `${changed} submission${changed === 1 ? "" : "s"} → ${label}`,
          description:
            skipped > 0 ? `${skipped} skipped — not eligible.` : undefined,
        });
      }
      onDone();
    });
  }

  function onClick(target: Target) {
    if (target.confirm) setConfirming(target);
    else apply(target);
  }

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm">
      <span className="text-sm font-medium text-indigo-900">{n} selected</span>
      <span className="text-xs text-indigo-700">Set status:</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason (optional, for Hold / Reject)"
          className="h-8 w-40 text-sm"
        >
          <option value="">Reason (optional)…</option>
          {STATUS_CHANGE_REASONS.map((r) => (
            <option key={r} value={r}>
              {STATUS_CHANGE_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
        {TARGETS.map((t) => (
          <Button
            key={t.status}
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => onClick(t)}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onDone}
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          const target = confirming;
          setConfirming(null);
          if (target) apply(target);
        }}
        title={
          confirming
            ? `${confirming.label} ${n} submission${n === 1 ? "" : "s"}?`
            : ""
        }
        description={
          confirming
            ? `They'll move to ${SUBMISSION_STATUS_LABEL[confirming.status]}. Rows that aren't eligible (already closed or joined) are skipped. You can change status again afterward.`
            : undefined
        }
        confirmLabel={confirming?.label ?? "Confirm"}
        tone="danger"
      />
    </div>
  );
}
