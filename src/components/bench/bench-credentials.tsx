"use client";

import { useState } from "react";

// Admin-only marketing credentials block. Values are server-rendered (the page
// already gates on canViewBenchCredentials), but the password stays masked
// until an explicit reveal so it isn't shoulder-surfed by default.
export function BenchCredentials({
  marketingEmail,
  marketingPassword,
  marketingNumber,
  personalNumber,
}: {
  marketingEmail: string | null;
  marketingPassword: string | null;
  marketingNumber: string | null;
  personalNumber: string | null;
}) {
  const [show, setShow] = useState(false);
  const has =
    marketingEmail || marketingPassword || marketingNumber || personalNumber;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Marketing credentials</p>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
          Admin only
        </span>
      </div>
      {!has ? (
        <p className="mt-2 text-sm text-slate-500">None on file.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Row label="Marketing email" value={marketingEmail} />
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Password</dt>
            <dd className="mt-0.5 flex items-center gap-2 text-sm text-slate-800">
              {marketingPassword ? (
                <>
                  <span className="font-mono">
                    {show ? marketingPassword : "•".repeat(Math.min(12, marketingPassword.length || 8))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    {show ? "Hide" : "Reveal"}
                  </button>
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </dd>
          </div>
          <Row label="Marketing number" value={marketingNumber} />
          <Row label="Personal number" value={personalNumber} />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}
