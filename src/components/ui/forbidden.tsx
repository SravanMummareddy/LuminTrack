import Link from "next/link";
import { ShieldAlert } from "lucide-react";

// Shown when a signed-in recruiter tries to load a manager/team-lead-gated
// route. Replaces the previous `notFound()` redirect, which produced a generic
// 404 with no explanation. Audit finding H4 (2026-05-26).
export function Forbidden({
  message = "This page is limited to managers and team leads. If you need access, ask a manager to update your role.",
}: {
  message?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-amber-100 p-3 text-amber-700">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Forbidden</h1>
      <p className="text-sm text-slate-500">{message}</p>
      <Link
        href="/"
        className="mt-2 inline-flex h-9 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
