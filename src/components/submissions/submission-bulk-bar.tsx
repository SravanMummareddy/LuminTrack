"use client";

import { useState, useTransition } from "react";
import { PauseCircle, XCircle, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  STATUS_CHANGE_REASONS,
  STATUS_CHANGE_REASON_LABEL,
  SUBMISSION_STATUS_LABEL,
} from "@/lib/labels";
import { bulkChangeSubmissionStatus } from "@/server/actions/submissions";

// Only the safe branch outcomes are offered in bulk — advancing / marking joined
// stays per-submission (gates + placement cascade). Mirror the server's
// BULK_STATUS_TARGETS.
const TARGETS = [
  { status: "ON_HOLD", label: "Hold", icon: PauseCircle, hasReason: true },
  { status: "REJECTED", label: "Reject", icon: XCircle, hasReason: true },
  { status: "BACKED_OUT", label: "Backed out", icon: UserMinus, hasReason: false },
] as const;

export function SubmissionBulkBar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const n = selectedIds.length;

  function setStatus(status: string, hasReason: boolean) {
    const fd = new FormData();
    for (const id of selectedIds) fd.append("ids", id);
    fd.set("status", status);
    if (hasReason && reason) fd.set("reason", reason);
    startTransition(async () => {
      await bulkChangeSubmissionStatus(fd);
      toast({
        tone: "success",
        title: `${n} submission${n === 1 ? "" : "s"} → ${
          SUBMISSION_STATUS_LABEL[status as keyof typeof SUBMISSION_STATUS_LABEL]
        }`,
        description: "Rows not eligible for this change were skipped.",
      });
      onDone();
    });
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
        {TARGETS.map(({ status, label, icon: Icon, hasReason }) => (
          <Button
            key={status}
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => setStatus(status, hasReason)}
          >
            <Icon className="h-4 w-4" />
            {label}
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
    </div>
  );
}
