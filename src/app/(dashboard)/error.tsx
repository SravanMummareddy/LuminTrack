"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div className="rounded-full bg-red-50 p-3 text-red-500">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-semibold text-slate-900">
        Something went wrong
      </h1>
      <p className="text-sm text-slate-500">
        An unexpected error occurred while loading this page. You can try
        again, or head back to the dashboard.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-slate-400">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-9 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
