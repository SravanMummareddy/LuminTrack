"use client";

import { useEffect, useState } from "react";
import { Eye, Download, ShieldX, Send, FileText, FileBadge } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import {
  CANDIDATE_STATUS_LABEL,
  JOB_STATUS_LABEL,
  SUBMISSION_STATUS_LABEL,
} from "@/lib/labels";
import type {
  ArchiveSummary,
  CandidateArchiveSummary,
  JobArchiveSummary,
} from "@/server/exporters/read-archive-summary";

/** Look up a human label, falling back to the raw enum string for anything
 *  unrecognised (a backup could predate a label rename). */
function label(map: Record<string, string>, value: string | null): string {
  if (!value) return "—";
  return map[value] ?? value;
}

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {term}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function CountChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
      {icon}
      {children}
    </span>
  );
}

function CandidateBody({ s }: { s: CandidateArchiveSummary }) {
  const exp =
    s.totalExperienceYears != null || s.realTimeExperienceYears != null
      ? [
          s.totalExperienceYears != null
            ? `${s.totalExperienceYears} yrs total`
            : null,
          s.realTimeExperienceYears != null
            ? `${s.realTimeExperienceYears} real-time`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
          {s.fullName
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase() || "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {s.fullName}
          </p>
          <p className="truncate text-sm text-slate-500">
            {[s.technology, s.currentCompany].filter(Boolean).join(" · ") ||
              "No technology on file"}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <Field term="Email">
          {s.email ? (
            <span className="break-all text-indigo-600">{s.email}</span>
          ) : (
            "—"
          )}
        </Field>
        <Field term="Phone">{s.phone || "—"}</Field>
        <Field term="Location">{s.currentLocation || "—"}</Field>
        <Field term="Status when erased">
          {label(CANDIDATE_STATUS_LABEL, s.status)}
        </Field>
        <Field term="Work authorization">{s.workAuthorization || "—"}</Field>
        <Field term="Experience">{exp}</Field>
      </dl>

      {s.featuredSkills.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <dt className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Featured skills
          </dt>
          <div className="flex flex-wrap gap-1.5">
            {s.featuredSkills.map((sk) => (
              <span
                key={sk}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700"
              >
                {sk}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-slate-100 pt-3">
        <dt className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          What&apos;s in this backup
        </dt>
        <div className="mb-3 flex flex-wrap gap-2">
          <CountChip icon={<Send className="h-3.5 w-3.5" aria-hidden />}>
            {s.submissionsCount} submission{s.submissionsCount === 1 ? "" : "s"}
          </CountChip>
          <CountChip icon={<FileText className="h-3.5 w-3.5" aria-hidden />}>
            {s.resumesCount} résumé{s.resumesCount === 1 ? "" : "s"}
          </CountChip>
          <CountChip icon={<FileBadge className="h-3.5 w-3.5" aria-hidden />}>
            {s.documentsCount} document{s.documentsCount === 1 ? "" : "s"}
          </CountChip>
        </div>
        {s.submissions.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {s.submissions.map((sub) => (
              <li
                key={sub.id}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate text-slate-700">
                  <span className="font-mono text-xs text-slate-500">
                    {sub.id}
                  </span>{" "}
                  · {sub.job ?? "—"}
                  {sub.client ? (
                    <span className="text-slate-500"> · {sub.client}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {label(SUBMISSION_STATUS_LABEL, sub.status)}
                </span>
              </li>
            ))}
            {s.submissionsCount > s.submissions.length && (
              <li className="py-1.5 text-xs text-slate-400">
                + {s.submissionsCount - s.submissions.length} more — download to
                see all
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function JobBody({ s }: { s: JobArchiveSummary }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold text-slate-900">{s.title}</p>
        <p className="text-sm text-slate-500">
          {[s.client, s.vendor].filter(Boolean).join(" · ") || "No client/vendor"}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <Field term="Status when erased">
          {label(JOB_STATUS_LABEL, s.status)}
        </Field>
        <Field term="Location">{s.location || "—"}</Field>
        <Field term="Positions">{s.positions ?? "—"}</Field>
        <Field term="Client rate">
          {s.clientRate != null ? `$${s.clientRate}/hr` : "—"}
        </Field>
      </dl>

      <div className="border-t border-slate-100 pt-3">
        <dt className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          What&apos;s in this backup
        </dt>
        <div className="mb-3 flex flex-wrap gap-2">
          <CountChip icon={<Send className="h-3.5 w-3.5" aria-hidden />}>
            {s.submissionsCount} submission{s.submissionsCount === 1 ? "" : "s"}
          </CountChip>
          <CountChip icon={<FileText className="h-3.5 w-3.5" aria-hidden />}>
            {s.requirementsCount} requirement
            {s.requirementsCount === 1 ? "" : "s"}
          </CountChip>
        </div>
        {s.submissions.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {s.submissions.map((sub) => (
              <li
                key={sub.id}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="min-w-0 truncate text-slate-700">
                  <span className="font-mono text-xs text-slate-500">
                    {sub.id}
                  </span>{" "}
                  · {sub.candidate}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {label(SUBMISSION_STATUS_LABEL, sub.status)}
                </span>
              </li>
            ))}
            {s.submissionsCount > s.submissions.length && (
              <li className="py-1.5 text-xs text-slate-400">
                + {s.submissionsCount - s.submissions.length} more — download to
                see all
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * "Preview" button + modal for an erased-backup row. Opening it reads the backup
 * zip in-app (via the admin-only preview route) so an admin can see exactly what
 * a backup contains before removing it for good — no download needed. Download +
 * Remove-for-good live in the modal footer too, so identify → delete is one flow.
 */
export function ArchivePreviewModal({
  kind,
  displayId,
  pathname,
  url,
  downloadHref,
  removeAction,
}: {
  kind: "candidate" | "job";
  displayId: string;
  pathname: string;
  url: string;
  downloadHref: string;
  removeAction: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ArchiveSummary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || summary) return;
    const controller = new AbortController();
    const endpoint =
      kind === "candidate"
        ? "/api/candidates/archives/preview"
        : "/api/jobs/archives/preview";
    fetch(`${endpoint}?path=${encodeURIComponent(pathname)}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: ArchiveSummary) => setSummary(data))
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [open, summary, kind, pathname]);

  const noun = kind === "candidate" ? "candidate" : "job";

  return (
    <>
      <button
        type="button"
        className={`${buttonClass("secondary")} text-indigo-700`}
        onClick={() => setOpen(true)}
      >
        <Eye className="h-4 w-4" aria-hidden />
        Preview
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={summary && "fullName" in summary ? summary.fullName : displayId}
        description={`${displayId} · erased backup`}
        className="max-w-xl"
      >
        <div className="space-y-4">
          {error ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Couldn&apos;t read this backup — the file may be missing. You can
              still download it to inspect the raw contents.
            </p>
          ) : !summary ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Loading backup…
            </p>
          ) : summary.kind === "candidate" ? (
            <CandidateBody s={summary} />
          ) : (
            <JobBody s={summary} />
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <a href={downloadHref} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden />
              Download
            </a>
            <ConfirmSubmit
              action={removeAction}
              fields={{ pathname, url }}
              title={`Remove backup ${displayId} for good?`}
              description={`This permanently removes the backup zip. After this, the ${noun}'s data is unrecoverable.`}
              confirmLabel="Remove for good"
              triggerClassName={buttonClass("danger")}
              trigger={
                <>
                  <ShieldX className="h-4 w-4" aria-hidden />
                  Remove for good
                </>
              }
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}
