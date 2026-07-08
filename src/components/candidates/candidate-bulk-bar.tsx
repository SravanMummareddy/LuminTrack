"use client";

import { useState, useTransition } from "react";
import { Archive, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  bulkArchiveCandidates,
  bulkTagCandidates,
  bulkTrashCandidates,
} from "@/server/actions/candidates";

export function CandidateBulkBar({
  selectedIds,
  canDelete,
  onDone,
}: {
  selectedIds: string[];
  canDelete: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [tag, setTag] = useState("");
  const { toast } = useToast();
  const n = selectedIds.length;

  function run(
    action: (fd: FormData) => Promise<void>,
    fill: ((fd: FormData) => void) | undefined,
    successTitle: string,
  ) {
    const fd = new FormData();
    for (const id of selectedIds) fd.append("ids", id);
    fill?.(fd);
    startTransition(async () => {
      await action(fd);
      toast({ tone: "success", title: successTitle });
      onDone();
    });
  }

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm">
      <span className="text-sm font-medium text-indigo-900">{n} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="tag…"
            aria-label="Tag to add"
            className="h-8 w-28"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !tag.trim()}
            onClick={() =>
              run(bulkTagCandidates, (fd) => fd.set("tag", tag), `Tagged ${n}`)
            }
          >
            <Tag className="h-4 w-4" />
            Add tag
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(bulkArchiveCandidates, undefined, `Archived ${n}`)
          }
        >
          <Archive className="h-4 w-4" />
          Archive
        </Button>
        {canDelete && (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(bulkTrashCandidates, undefined, `Moved ${n} to trash`)
            }
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
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
