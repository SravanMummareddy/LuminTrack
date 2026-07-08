"use client";

import { useState } from "react";

// Consolidated marketing profile + shared portal credentials — all the
// marketing-specific fields in one place (owner asked to stop scattering them).
// Visible to any signed-in user (owner decision); the password stays masked
// until an explicit reveal so it isn't shoulder-surfed by default.
export function BenchMarketingDetails({
  marketingRecruiter,
  marketingStartDate,
  marketingExperience,
  marketingEmail,
  marketingPassword,
  marketingNumber,
}: {
  marketingRecruiter: string | null;
  marketingStartDate: string | null;
  marketingExperience: string | null;
  marketingEmail: string | null;
  marketingPassword: string | null;
  marketingNumber: string | null;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <p className="text-sm font-medium text-slate-700">Marketing details</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Marketing recruiter" value={marketingRecruiter} />
        <Row label="Marketing start date" value={marketingStartDate} />
        <Row label="Marketing experience" value={marketingExperience} />
        <Row label="Marketing email" value={marketingEmail} />
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Password</dt>
          <dd className="mt-0.5 flex items-center gap-2 text-sm text-slate-800">
            {marketingPassword ? (
              <>
                <span className="font-mono">
                  {show
                    ? marketingPassword
                    : "•".repeat(Math.min(12, marketingPassword.length || 8))}
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
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">
        {value || <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}
