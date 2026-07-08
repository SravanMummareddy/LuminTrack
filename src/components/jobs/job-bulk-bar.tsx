"use client";

import { useState, useTransition } from "react";
import { PlayCircle, PauseCircle, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { bulkChangeJobStatus } from "@/server/actions/jobs";
import { jobStatusActions } from "@/lib/job-flow";
import type { JobStatus } from "@/generated/prisma/enums";

// The bulk bar offers the three common moves. Each is enabled only when at least
// one selected job can actually take it (per `jobStatusActions`), so "Reopen"
// isn't offered when everything selected is already Open. Close is destructive
// (it cancels the jobs' open requirements) so it confirms first.
const TARGETS = [
  { status: "OPEN", label: "Reopen", icon: PlayCircle, confirm: false },
  { status: "ON_HOLD", label: "Hold", icon: PauseCircle, confirm: false },
  { status: "CLOSED", label: "Close", icon: XCircle, confirm: true },
] as const;

type Target = (typeof TARGETS)[number];

export function JobBulkBar({
  selectedIds,
  selectedStatuses,
  onDone,
}: {
  selectedIds: string[];
  selectedStatuses: JobStatus[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Target | null>(null);
  const { toast } = useToast();
  const n = selectedIds.length;

  // The union of valid next-statuses across the selection. An action is enabled
  // iff its target status appears here for at least one selected job.
  const validNext = new Set<JobStatus>();
  for (const s of selectedStatuses)
    for (const a of jobStatusActions(s)) validNext.add(a.next);

  function apply(target: Target) {
    const fd = new FormData();
    for (const id of selectedIds) fd.append("ids", id);
    fd.set("status", target.status);
    startTransition(async () => {
      const { changed, skipped } = await bulkChangeJobStatus(fd);
      if (changed === 0) {
        toast({
          tone: "error",
          title: "Nothing changed",
          description: `None of the ${n} selected could move to ${target.label} (already there).`,
        });
      } else {
        toast({
          tone: "success",
          title: `${changed} job${changed === 1 ? "" : "s"} → ${target.label}`,
          description: skipped > 0 ? `${skipped} skipped.` : undefined,
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
        {TARGETS.map((t) => {
          const enabled = validNext.has(t.status);
          return (
            <Button
              key={t.status}
              size="sm"
              variant="secondary"
              disabled={pending || !enabled}
              title={
                enabled
                  ? undefined
                  : `No selected job can be set to "${t.label}"`
              }
              onClick={() => onClick(t)}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Button>
          );
        })}
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
        title={`Close ${n} job${n === 1 ? "" : "s"}?`}
        description="Any open requirements on these jobs are cancelled; submissions are kept. Jobs already closed are skipped. You can reopen them later."
        confirmLabel="Close"
        tone="danger"
      />
    </div>
  );
}
