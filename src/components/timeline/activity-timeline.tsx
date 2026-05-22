import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { ActivityAction } from "@/generated/prisma/enums";
import {
  STATUS_CHANGE_REASON_LABEL,
  type StatusChangeReason,
} from "@/lib/labels";

type Entry = {
  id: string;
  action: ActivityAction;
  description: string;
  createdAt: Date | string;
  eventAt: Date | string | null;
  note: string | null;
  reason: string | null;
  performedBy: { fullName: string };
};

/** Colours the timeline dot so milestone outcomes stand out at a glance. */
function dotClass(action: ActivityAction): string {
  if (
    action === "CANDIDATE_SELECTED" ||
    action === "OFFER_RELEASED" ||
    action === "CANDIDATE_JOINED"
  )
    return "bg-green-500";
  if (action === "CANDIDATE_REJECTED") return "bg-red-500";
  return "bg-indigo-500";
}

/**
 * Chronological audit timeline shown on the job / candidate / submission detail
 * pages. Entries come from `getTimelineFor()`, newest first.
 */
export function ActivityTimeline({ entries }: { entries: Entry[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Activity timeline
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">No activity recorded yet.</p>
      ) : (
        <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-slate-200">
          {entries.map((entry) => (
            <li key={entry.id} className="relative pl-6">
              <span
                className={cn(
                  "absolute left-0 top-1 h-[11px] w-[11px] rounded-full ring-4 ring-white",
                  dotClass(entry.action),
                )}
              />
              <p className="text-sm text-slate-800">{entry.description}</p>
              {entry.reason && (
                <p className="mt-1">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                    {STATUS_CHANGE_REASON_LABEL[
                      entry.reason as StatusChangeReason
                    ] ?? entry.reason}
                  </span>
                </p>
              )}
              {entry.note && (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-600">
                  {entry.note}
                </p>
              )}
              <p className="mt-0.5 text-xs text-slate-400">
                {entry.performedBy.fullName} ·{" "}
                {entry.eventAt
                  ? `happened ${formatDateTime(entry.eventAt)} · recorded ${formatDateTime(entry.createdAt)}`
                  : formatDateTime(entry.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
