"use client";

import { useTransition } from "react";
import { PlayCircle, PauseCircle, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { bulkChangeJobStatus } from "@/server/actions/jobs";

export function JobBulkBar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const n = selectedIds.length;

  function setStatus(status: string, label: string) {
    const fd = new FormData();
    for (const id of selectedIds) fd.append("ids", id);
    fd.set("status", status);
    startTransition(async () => {
      await bulkChangeJobStatus(fd);
      toast({ tone: "success", title: `${n} job${n === 1 ? "" : "s"} → ${label}` });
      onDone();
    });
  }

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm">
      <span className="text-sm font-medium text-indigo-900">{n} selected</span>
      <span className="text-xs text-indigo-700">Set status:</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => setStatus("OPEN", "Open")}
        >
          <PlayCircle className="h-4 w-4" />
          Reopen
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => setStatus("ON_HOLD", "On hold")}
        >
          <PauseCircle className="h-4 w-4" />
          Hold
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => setStatus("CLOSED", "Closed")}
        >
          <XCircle className="h-4 w-4" />
          Close
        </Button>
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
