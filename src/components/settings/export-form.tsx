"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Entity = {
  key: string;
  label: string;
  group: "operational" | "reference" | "sensitive";
};

const ENTITIES: Entity[] = [
  { key: "jobs", label: "Jobs", group: "operational" },
  { key: "candidates", label: "Candidates", group: "operational" },
  { key: "submissions", label: "Submissions", group: "operational" },
  { key: "placements", label: "Placements", group: "operational" },
  { key: "interviewRounds", label: "Interview rounds", group: "operational" },
  { key: "clients", label: "Clients", group: "reference" },
  { key: "vendors", label: "Vendors", group: "reference" },
  { key: "sources", label: "Sources", group: "reference" },
  { key: "recruiters", label: "Recruiters", group: "reference" },
  { key: "resumes", label: "Resumes", group: "sensitive" },
  { key: "documents", label: "Documents", group: "sensitive" },
  { key: "activity", label: "Activity log", group: "sensitive" },
];

const GROUP_LABEL: Record<Entity["group"], string> = {
  operational: "Operational",
  reference: "Reference",
  sensitive: "Sensitive (full backup only)",
};

const DEFAULT_BUSINESS_ENTITIES = new Set([
  "jobs",
  "candidates",
  "submissions",
  "placements",
  "interviewRounds",
  "clients",
  "vendors",
  "sources",
  "recruiters",
  "documents",
]);

export function ExportForm({ totals }: { totals: Record<string, number> }) {
  const [mode, setMode] = useState<"business" | "full">("business");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(DEFAULT_BUSINESS_ENTITIES),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visibleEntities = useMemo(
    () =>
      ENTITIES.filter(
        (e) => e.group !== "sensitive" || mode === "full",
      ),
    [mode],
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submitExcel() {
    setError(null);
    const entities = Array.from(selected).filter((k) =>
      visibleEntities.some((e) => e.key === k),
    );
    if (entities.length === 0) {
      setError("Pick at least one entity to export.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/export/excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, entities }),
        });
        if (!res.ok) {
          setError(`Export failed (${res.status}): ${await res.text()}`);
          return;
        }
        await downloadBlob(res, `lumintrack-${mode}-${today()}.xlsx`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed.");
      }
    });
  }

  function submitJson() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/export/full", { method: "POST" });
        if (!res.ok) {
          setError(`Backup failed (${res.status}): ${await res.text()}`);
          return;
        }
        await downloadBlob(res, `lumintrack-backup-${today()}.json`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Backup failed.");
      }
    });
  }

  const preflightRows = useMemo(() => {
    const map: Record<string, keyof typeof totals> = {
      jobs: "jobs",
      candidates: "candidates",
      submissions: "submissions",
      placements: "placements",
      interviewRounds: "interviewRounds",
      clients: "clients",
      vendors: "vendors",
      sources: "sources",
      recruiters: "users",
      resumes: "resumes",
      documents: "documents",
      activity: "activities",
    };
    const rows: { label: string; count: number }[] = [];
    for (const e of visibleEntities) {
      if (!selected.has(e.key)) continue;
      const total = totals[map[e.key]] ?? 0;
      rows.push({ label: e.label, count: total });
    }
    return rows;
  }, [selected, visibleEntities, totals]);

  const rowSum = preflightRows.reduce((a, r) => a + r.count, 0);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-medium text-slate-600">Mode</div>
        <div
          role="radiogroup"
          aria-label="Export mode"
          className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
        >
          {(["business", "full"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition",
                mode === m
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {m === "business" ? "Business export" : "Full backup"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {mode === "business"
            ? "No PII, no rates, no identity/work-auth documents."
            : "Admin-only. Includes rates, sensitive documents, and Drive links."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["operational", "reference", "sensitive"] as const).map((group) => {
          const items = visibleEntities.filter((e) => e.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {GROUP_LABEL[group]}
              </div>
              <ul className="space-y-1.5">
                {items.map((e) => (
                  <li key={e.key}>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selected.has(e.key)}
                        onChange={() => toggle(e.key)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      {e.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {preflightRows.length === 0 ? (
          <span>No entities selected.</span>
        ) : (
          <>
            <span className="font-medium text-slate-700">Pre-flight: </span>
            {preflightRows
              .map((r) => `${r.count.toLocaleString()} ${r.label.toLowerCase()}`)
              .join(" · ")}{" "}
            <span className="text-slate-400">
              (~{Math.max(1, Math.ceil(rowSum / 1024))} MB estimated)
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submitExcel}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {pending ? "Generating…" : "Download Excel"}
        </button>
        <button
          type="button"
          onClick={submitJson}
          disabled={pending || mode !== "full"}
          title={mode !== "full" ? "JSON backup is restore-grade and admin-only (full mode)." : undefined}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          Download JSON backup
        </button>
      </div>
    </div>
  );
}

async function downloadBlob(res: Response, filename: string) {
  const cd = res.headers.get("content-disposition");
  const match = cd?.match(/filename="([^"]+)"/);
  const name = match?.[1] ?? filename;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
