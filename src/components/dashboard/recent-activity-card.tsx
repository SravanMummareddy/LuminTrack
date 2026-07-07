import Link from "next/link";
import {
  Send,
  ClipboardList,
  UserCheck,
  CircleCheck,
  CircleX,
  FileText,
  CalendarClock,
  ArrowRightCircle,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import type { MyRecentActivity } from "@/server/queries/dashboard";

type Row = MyRecentActivity[number];

const ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  CANDIDATE_SUBMITTED: { icon: Send, cls: "text-indigo-600" },
  REQUIREMENT_CREATED: { icon: ClipboardList, cls: "text-purple-600" },
  REQUIREMENT_CONVERTED: { icon: Send, cls: "text-indigo-600" },
  CANDIDATE_JOINED: { icon: UserCheck, cls: "text-green-600" },
  CANDIDATE_SELECTED: { icon: CircleCheck, cls: "text-green-600" },
  CANDIDATE_REJECTED: { icon: CircleX, cls: "text-red-600" },
  OFFER_RELEASED: { icon: FileText, cls: "text-indigo-600" },
  OFFER_ACCEPTED: { icon: FileText, cls: "text-indigo-600" },
  INTERVIEW_ROUND_SCHEDULED: { icon: CalendarClock, cls: "text-amber-600" },
  INTERVIEW_ROUND_UPDATED: { icon: CalendarClock, cls: "text-amber-600" },
  SUBMISSION_STATUS_CHANGED: { icon: ArrowRightCircle, cls: "text-blue-600" },
};

function iconFor(action: string): { icon: LucideIcon; cls: string } {
  return ICONS[action] ?? { icon: ActivityIcon, cls: "text-slate-400" };
}

/** "just now" / "3h ago" / "2d ago" / "Jul 6" — compact relative time. */
function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecentActivityCard({ items }: { items: Row[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Recent activity
      </h2>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
          Nothing yet — your recent actions will show up here.
        </p>
      ) : (
        <ul>
          {items.map((it) => {
            const { icon: Icon, cls } = iconFor(it.action);
            const inner = (
              <>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">
                    {it.description}
                  </span>
                  <span className="block truncate text-xs text-slate-400">
                    {it.entity ? `${it.entity} · ` : ""}
                    {relativeTime(it.createdAt)}
                  </span>
                </span>
              </>
            );
            return (
              <li
                key={it.id}
                className="border-t border-slate-100 first:border-t-0"
              >
                {it.href ? (
                  <Link
                    href={it.href}
                    className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:[outline-offset:-2px]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-2 py-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
