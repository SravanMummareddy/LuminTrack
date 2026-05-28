"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, FileJson, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  previewRequisitions,
  importRequisitions,
  type IlaborImportPreviewState,
  type IlaborImportResultState,
} from "@/server/actions/ilabor-import";

const PREVIEW_INITIAL: IlaborImportPreviewState = { status: "idle" };
const IMPORT_INITIAL: IlaborImportResultState = { status: "idle" };

/** Cap the error list so a 300-row file doesn't render 300 rows of red. */
const MAX_ERROR_ROWS = 50;

/**
 * Three-step wizard:
 *   1. Upload  — file picker → previewRequisitions
 *   2. Preview — summary cards + tables → importRequisitions on confirm
 *   3. Result  — success summary + back to /jobs
 *
 * The same File object is reused for preview and import. We hold it in a ref
 * (so re-renders don't reset it) and re-attach it to a fresh FormData when
 * the admin confirms. No upload tokens, no server-side state.
 */
export function ImportRequisitions() {
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [previewState, previewAction, previewPending] = useActionState(
    previewRequisitions,
    PREVIEW_INITIAL,
  );
  const [importState, importAction, importPending] = useActionState(
    importRequisitions,
    IMPORT_INITIAL,
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    fileRef.current = f;
  }

  function reset() {
    setFile(null);
    fileRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
    // Re-initialize action states by reloading the page — useActionState has no
    // built-in reset. A hard reload is the cleanest way back to step 1.
    window.location.reload();
  }

  // ── Step 3: result ────────────────────────────────────────────────────────
  if (importState.status === "success" && importState.result) {
    const r = importState.result;
    return (
      <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" />
          <h2 className="text-base font-semibold">Import complete</h2>
        </div>
        <p className="text-sm text-slate-700">
          Created <strong>{r.createdCount}</strong> · Updated{" "}
          <strong>{r.updatedCount}</strong>
          {r.erroredCount > 0 ? (
            <>
              {" "}
              · Skipped <strong>{r.erroredCount}</strong>
            </>
          ) : null}
          {r.statusWarningCount > 0 ? (
            <>
              {" "}
              · Unmapped statuses: <strong>{r.statusWarningCount}</strong>
            </>
          ) : null}
        </p>
        <div className="flex gap-2">
          <Link
            href="/jobs"
            className="inline-flex items-center rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            View jobs
          </Link>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Import another file
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: preview ───────────────────────────────────────────────────────
  if (previewState.status === "ready" && previewState.summary) {
    const s = previewState.summary;
    const errs = previewState.errorRows ?? [];
    const shownErrs = errs.slice(0, MAX_ERROR_ROWS);
    const hiddenErrCount = Math.max(0, errs.length - shownErrs.length);

    return (
      <form
        action={(fd) => {
          // The preview's FormData is gone — re-attach the file we kept in the ref.
          if (fileRef.current) fd.set("file", fileRef.current);
          importAction(fd);
        }}
        className="space-y-5"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="New" value={s.newCount} tone="emerald" />
          <SummaryCard label="Updated" value={s.updatedCount} tone="indigo" />
          <SummaryCard label="Errored" value={s.erroredCount} tone="red" />
          <SummaryCard
            label="Unmapped status"
            value={s.statusWarningCount}
            tone="amber"
            hint="Imported as Open"
          />
        </div>

        <p className="text-xs text-slate-500">
          Captured {new Date(s.capturedAt).toLocaleString()} · {s.totalRows} row
          {s.totalRows === 1 ? "" : "s"} in file
        </p>

        {(() => {
          // Per-row drift banner — surfaces silent ID re-use risk. If the
          // same Req ID now points at a different title or client, the
          // upsert would overwrite the existing job's metadata while
          // keeping the existing submissions/placements attached. The
          // operator should confirm those are the same logical req.
          const driftRows = (previewState.updatedRows ?? []).filter(
            (r) => r.titleDrifted || r.customerDrifted,
          );
          if (driftRows.length === 0) return null;
          return (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <strong>{driftRows.length} updated row
              {driftRows.length === 1 ? " has" : "s have"}</strong>{" "}
              a different title or client than the existing LuminTrack job
              with the same Req ID. Review the &quot;title changed&quot; /
              &quot;client changed&quot; badges in the Updated rows table below before
              committing — your existing submissions, placements, and notes
              will stay attached to the same Job IDs even if iLabor has
              re-used those Req IDs for a different role.
            </div>
          );
        })()}

        {(() => {
          // Net-new Vendor/Client name banner — surfaces likely-rename risk.
          // Names compared case-insensitively, so "RANDSTAD" vs "Randstad"
          // is NOT new; only a genuinely different name lands here.
          const nv = previewState.newVendorNames ?? [];
          const nc = previewState.newClientNames ?? [];
          if (nv.length === 0 && nc.length === 0) return null;
          return (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-medium">
                This import will create {nv.length} new vendor
                {nv.length === 1 ? "" : "s"} and {nc.length} new client
                {nc.length === 1 ? "" : "s"}.
              </p>
              {nv.length > 0 ? (
                <p className="mt-1">
                  <span className="font-medium">New vendors:</span>{" "}
                  {nv.slice(0, 10).join(", ")}
                  {nv.length > 10 ? `, + ${nv.length - 10} more` : ""}
                </p>
              ) : null}
              {nc.length > 0 ? (
                <p className="mt-0.5">
                  <span className="font-medium">New clients:</span>{" "}
                  {nc.slice(0, 10).join(", ")}
                  {nc.length > 10 ? `, + ${nc.length - 10} more` : ""}
                </p>
              ) : null}
              <p className="mt-1 text-amber-700">
                If any of these are renames of existing rows, rename the
                LuminTrack row first (Settings → Clients / Vendors) so jobs
                stay linked — otherwise the existing jobs will keep pointing
                at the old name and reports will double-count.
              </p>
            </div>
          );
        })()}

        {errs.length > 0 ? (
          <details className="rounded-lg border border-red-200 bg-red-50" open>
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-red-700">
              {errs.length} row{errs.length === 1 ? "" : "s"} will be skipped
            </summary>
            <div className="border-t border-red-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-red-100 text-red-800">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Hint</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {shownErrs.map((e) => (
                    <tr key={e.rowIndex}>
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">
                        #{e.rowIndex + 1}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">{e.hint || "—"}</td>
                      <td className="px-3 py-1.5 text-red-700">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hiddenErrCount > 0 ? (
                <p className="px-3 py-2 text-xs text-red-700">
                  + {hiddenErrCount} more error{hiddenErrCount === 1 ? "" : "s"} not
                  shown.
                </p>
              ) : null}
            </div>
          </details>
        ) : null}

        <RowsTable title="New requisitions" rows={previewState.newRows ?? []} />
        <RowsTable
          title="Existing requisitions (will be updated)"
          rows={previewState.updatedRows ?? []}
          updateMode
        />

        {importState.status === "error" && importState.error ? (
          <ErrorBanner message={importState.error} />
        ) : null}

        <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
          <Button type="submit" disabled={importPending || s.newCount + s.updatedCount === 0}>
            {importPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                Confirm import ({s.newCount + s.updatedCount} row
                {s.newCount + s.updatedCount === 1 ? "" : "s"})
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={reset}
            disabled={importPending}
            className="text-sm text-slate-600 hover:underline disabled:opacity-60"
          >
            Start over
          </button>
        </div>
      </form>
    );
  }

  // ── Step 1: upload ────────────────────────────────────────────────────────
  return (
    <form action={previewAction} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          iLabor JSON file
        </span>
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6">
          <FileJson className="h-8 w-8 text-slate-400" aria-hidden />
          <div className="flex-1">
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept="application/json,.json"
              required
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
            />
            <p className="mt-1 text-xs text-slate-500">
              Captured by the LuminTrack iLabor browser extension. Max 10 MB.
            </p>
          </div>
        </div>
      </label>

      {previewState.status === "error" && previewState.error ? (
        <ErrorBanner message={previewState.error} />
      ) : null}

      <Button type="submit" disabled={!file || previewPending}>
        {previewPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading file…
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Preview import
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const TONE_CLASSES = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
} as const;

function SummaryCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: keyof typeof TONE_CLASSES;
  hint?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${TONE_CLASSES[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] opacity-70">{hint}</p> : null}
    </div>
  );
}

type DigestRow = {
  rowIndex: number;
  requisitionId: string;
  jobTitle: string;
  customerName: string;
  requisitionStatus: string | null;
  statusUnknown: boolean;
  statusDiverged?: boolean;
  existingStatus?: string | null;
  titleDrifted?: boolean;
  existingTitle?: string | null;
  customerDrifted?: boolean;
  existingCustomer?: string | null;
};

function RowsTable({
  title,
  rows,
  updateMode = false,
}: {
  title: string;
  rows: DigestRow[];
  updateMode?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">
        {title} ({rows.length})
      </summary>
      <div className="border-t border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Req ID</th>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">iLabor status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 100).map((r) => (
              <tr key={r.requisitionId}>
                <td className="px-3 py-1.5 tabular-nums text-slate-600">
                  {r.requisitionId}
                </td>
                <td className="px-3 py-1.5 text-slate-800">
                  {r.jobTitle}
                  {updateMode && r.titleDrifted ? (
                    <span
                      className="ml-1 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800"
                      title={`Existing LuminTrack title: "${r.existingTitle ?? "—"}". The same Req ID now points at a different role — confirm this is the same requisition before importing.`}
                    >
                      title changed
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-slate-700">
                  {r.customerName}
                  {updateMode && r.customerDrifted ? (
                    <span
                      className="ml-1 inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800"
                      title={`Existing LuminTrack client: "${r.existingCustomer ?? "—"}". The same Req ID now points at a different customer — confirm before importing.`}
                    >
                      client changed
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-slate-700">
                  {r.requisitionStatus ?? "—"}
                  {r.statusUnknown ? (
                    <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      unmapped
                    </span>
                  ) : null}
                  {updateMode && r.statusDiverged ? (
                    <span
                      className="ml-1 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      title={`iLabor maps this to a different status than LuminTrack's current "${r.existingStatus ?? "—"}". LuminTrack's status is preserved on re-import.`}
                    >
                      status diverged · LuminTrack: {r.existingStatus ?? "—"}
                    </span>
                  ) : null}
                  {updateMode && !r.statusDiverged ? (
                    <span className="ml-1 text-[10px] text-slate-400">
                      (existing status preserved)
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 100 ? (
          <p className="px-3 py-2 text-xs text-slate-500">
            + {rows.length - 100} more not shown.
          </p>
        ) : null}
      </div>
    </details>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
