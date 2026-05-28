"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DocumentForm, type DocumentData } from "./document-form";
import { deleteCandidateDocument } from "@/server/actions/candidate-documents";
import type { DocumentCategory } from "@/generated/prisma/enums";

export type DocumentItem = DocumentData & {
  uploadedBy: { fullName: string } | null;
};

type CategoryMeta = {
  key: DocumentCategory;
  title: string;
  sensitive: boolean;
};

const CATEGORIES: CategoryMeta[] = [
  { key: "IDENTITY", title: "Identity", sensitive: true },
  { key: "WORK_AUTH", title: "Work authorization", sensitive: true },
  { key: "EDUCATION", title: "Education", sensitive: false },
  { key: "EMPLOYMENT", title: "Employment", sensitive: false },
  { key: "OTHER", title: "Other", sensitive: false },
];

const DAY = 24 * 60 * 60 * 1000;

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / DAY);
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function expiryPill(expiresAt: Date | null): { tone: string; text: string } | null {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  const dateText = fmtDate(expiresAt);
  if (days < 0) return { tone: "bg-red-100 text-red-800", text: `Expired ${dateText}` };
  if (days < 15) return { tone: "bg-red-100 text-red-800", text: `Expires ${dateText}` };
  if (days <= 30) return { tone: "bg-amber-100 text-amber-800", text: `Expires ${dateText}` };
  return { tone: "bg-slate-100 text-slate-700", text: `Expires ${dateText}` };
}

export function DocumentsManager({
  candidateId,
  documents,
  canManageSensitive,
}: {
  candidateId: string;
  documents: DocumentItem[];
  canManageSensitive: boolean;
}) {
  // Sensitive sections collapsed by default (PII shoulder-surf protection);
  // visible categories expanded.
  const [expanded, setExpanded] = useState<Record<DocumentCategory, boolean>>({
    IDENTITY: false,
    WORK_AUTH: false,
    EDUCATION: true,
    EMPLOYMENT: true,
    OTHER: true,
  });
  const [editing, setEditing] = useState<
    { mode: "new"; category?: DocumentCategory } | { mode: "edit"; doc: DocumentData } | null
  >(null);

  const visibleCategories = CATEGORIES.filter(
    (c) => canManageSensitive || !c.sensitive,
  );

  const byCategory = useMemo(() => {
    const map: Record<DocumentCategory, DocumentItem[]> = {
      IDENTITY: [],
      WORK_AUTH: [],
      EDUCATION: [],
      EMPLOYMENT: [],
      OTHER: [],
    };
    for (const d of documents) map[d.category].push(d);
    return map;
  }, [documents]);

  const expiringSoon = useMemo(() => {
    const counts: Partial<Record<DocumentCategory, number>> = {};
    let total = 0;
    for (const d of documents) {
      if (!d.expiresAt) continue;
      const days = daysUntil(d.expiresAt);
      if (days <= 30) {
        counts[d.category] = (counts[d.category] ?? 0) + 1;
        total += 1;
      }
    }
    return { total, counts };
  }, [documents]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Documents ({documents.length})
        </h2>
        <Button size="sm" onClick={() => setEditing({ mode: "new" })}>
          <Plus className="h-4 w-4" />
          Add document
        </Button>
      </div>

      {expiringSoon.total > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-medium">
              {expiringSoon.total} document{expiringSoon.total === 1 ? "" : "s"} expiring within 30 days
            </span>
            {Object.entries(expiringSoon.counts).length > 0 && (
              <span className="ml-1 text-amber-800">
                —{" "}
                {Object.entries(expiringSoon.counts)
                  .map(([k, v]) => {
                    const title = CATEGORIES.find((c) => c.key === k)?.title ?? k;
                    return `${title} (${v})`;
                  })
                  .join(", ")}
              </span>
            )}
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No documents yet. Add identity, work authorization, education, or
          employment records as needed.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleCategories.map((cat) => {
            const docs = byCategory[cat.key];
            const open = expanded[cat.key];
            return (
              <div
                key={cat.key}
                className="rounded-md border border-slate-200"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [cat.key]: !e[cat.key] }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-2">
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                    {cat.title}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                      {docs.length}
                    </span>
                    {cat.sensitive && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-normal text-indigo-700">
                        Admin only
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({ mode: "new", category: cat.key });
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    + Add
                  </button>
                </button>
                {open && (
                  <div className="border-t border-slate-200 px-4 py-3">
                    {docs.length === 0 ? (
                      <p className="py-2 text-xs text-slate-400">
                        No {cat.title.toLowerCase()} documents yet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {docs.map((d) => {
                          const pill = expiryPill(d.expiresAt);
                          return (
                            <li
                              key={d.id}
                              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-200 p-3"
                            >
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-slate-900">
                                  {d.label}
                                </span>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {d.issuedAt
                                    ? `Issued ${fmtDate(d.issuedAt)}`
                                    : "No issue date"}
                                  {d.uploadedBy
                                    ? ` · added by ${d.uploadedBy.fullName}`
                                    : ""}
                                </p>
                                {d.notes && (
                                  <p className="mt-1 text-xs text-slate-600">
                                    {d.notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
                                {pill && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-xs ${pill.tone}`}
                                  >
                                    {pill.text}
                                  </span>
                                )}
                                <a
                                  href={d.driveLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                                >
                                  Open
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditing({ mode: "edit", doc: d })
                                  }
                                  className="text-indigo-600 hover:text-indigo-800"
                                >
                                  Edit
                                </button>
                                <form action={deleteCandidateDocument}>
                                  <input type="hidden" name="id" value={d.id} />
                                  <button
                                    type="submit"
                                    onClick={(e) => {
                                      if (!window.confirm(`Delete "${d.label}"?`))
                                        e.preventDefault();
                                    }}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    Delete
                                  </button>
                                </form>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === "edit" ? "Edit document" : "Add document"}
      >
        {editing !== null && (
          <DocumentForm
            candidateId={candidateId}
            doc={editing.mode === "edit" ? editing.doc : undefined}
            defaultCategory={
              editing.mode === "new" ? editing.category : undefined
            }
            canManageSensitive={canManageSensitive}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}
