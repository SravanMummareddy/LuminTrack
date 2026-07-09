import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Table, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { prisma } from "@/server/db";
import { formatDateTime, deletedSuffix } from "@/lib/format";
import { ActivityAction } from "@/generated/prisma/enums";

const PAGE_SIZE = 25;

/**
 * §J2 — global admin audit log across all users + entities. The per-entity
 * timelines on Job / Candidate / Submission still exist; this view is the
 * org-wide cut, filterable by action type and acting user.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  if (!hasFullAccess(user)) return <Forbidden />;

  const sp = await searchParams;
  const get = (k: string) =>
    Array.isArray(sp[k]) ? (sp[k]?.[0] as string) : (sp[k] as string | undefined);

  const page = Math.max(1, Number(get("page") ?? 1) || 1);
  // Validate against the enum so a hand-crafted `?action=` doesn't 500 the
  // Prisma query. Unknown values fall back to "no filter".
  const ACTIONS = Object.values(ActivityAction) as string[];
  const rawAction = get("action");
  const actionFilter =
    rawAction && ACTIONS.includes(rawAction) ? rawAction : undefined;
  const userIdFilter = get("user");

  // Date-range filter on when the activity was recorded. `to` is inclusive of
  // the whole day. Invalid dates are ignored rather than 500-ing the query.
  const fromStr = get("from");
  const toStr = get("to");
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (fromStr) {
    const d = new Date(fromStr);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (toStr) {
    const d = new Date(`${toStr}T23:59:59.999`);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }
  const hasDateFilter = createdAt.gte != null || createdAt.lte != null;

  const where = {
    ...(actionFilter
      ? { action: actionFilter as keyof typeof ActivityAction }
      : {}),
    ...(userIdFilter ? { performedById: userIdFilter } : {}),
    ...(hasDateFilter ? { createdAt } : {}),
  };

  const [rows, total, users] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        action: true,
        description: true,
        note: true,
        createdAt: true,
        performedBy: { select: { id: true, fullName: true } },
        // Scalar FKs drive the link target; the relations below resolve a human
        // subject name (candidate / job / consultant) so each row is self-explanatory.
        jobId: true,
        candidateId: true,
        submissionId: true,
        requirementId: true,
        interviewRoundId: true,
        benchConsultantId: true,
        job: { select: { title: true, deletedAt: true, erasedAt: true } },
        candidate: {
          select: { fullName: true, deletedAt: true, erasedAt: true },
        },
        submission: {
          select: {
            candidate: {
              select: { fullName: true, deletedAt: true, erasedAt: true },
            },
            job: { select: { title: true } },
          },
        },
        interviewRound: {
          select: {
            submissionId: true,
            submission: {
              select: {
                candidate: { select: { fullName: true } },
                job: { select: { title: true } },
              },
            },
          },
        },
        benchConsultant: { select: { fullName: true } },
        requirement: { select: { job: { select: { title: true } } } },
      },
    }),
    prisma.activity.count({ where }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  const actions = Object.values(ActivityAction).sort();

  // Resolve the row's *subject* — the actual record it's about, named — so the
  // column answers "who / which", not just a generic type word. Checks the most
  // specific FK first (a row sets exactly one entity per logActivity). Removed
  // candidates/jobs keep their name with a " (deleted)" suffix.
  function subjectFor(
    r: (typeof rows)[number],
  ): { href: string | null; label: string } | null {
    if (r.submissionId && r.submission) {
      const c = r.submission.candidate;
      const name = c ? `${c.fullName}${deletedSuffix(c)}` : "Candidate";
      const jobTitle = r.submission.job?.title;
      return {
        href: `/submissions/${r.submissionId}`,
        label: jobTitle ? `${name} — ${jobTitle}` : name,
      };
    }
    if (r.interviewRoundId && r.interviewRound) {
      const sub = r.interviewRound.submission;
      const name = sub?.candidate?.fullName ?? "Interview";
      const jobTitle = sub?.job?.title;
      return {
        href: r.interviewRound.submissionId
          ? `/submissions/${r.interviewRound.submissionId}`
          : null,
        label: jobTitle ? `${name} — ${jobTitle}` : name,
      };
    }
    if (r.requirementId) {
      const jobTitle = r.requirement?.job?.title;
      return {
        href: `/vendor-portal/${r.requirementId}`,
        label: jobTitle ? `Requirement — ${jobTitle}` : "Requirement",
      };
    }
    if (r.candidateId) {
      return {
        href: `/candidates/${r.candidateId}`,
        label: r.candidate
          ? `${r.candidate.fullName}${deletedSuffix(r.candidate)}`
          : "Candidate",
      };
    }
    if (r.jobId) {
      return {
        href: `/jobs/${r.jobId}`,
        label: r.job ? `${r.job.title}${deletedSuffix(r.job)}` : "Job",
      };
    }
    if (r.benchConsultantId) {
      return {
        href: `/bench/${r.benchConsultantId}`,
        label: r.benchConsultant?.fullName ?? "Consultant",
      };
    }
    return null;
  }

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      <PageHeader
        title="Audit log"
        description="Org-wide activity across jobs, candidates, submissions, and interview rounds. Admin only."
      />

      <form className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="sm:w-auto">
          <label
            htmlFor="action"
            className="block text-xs font-medium text-slate-500"
          >
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={actionFilter ?? ""}
            className="mt-1 w-full max-w-full truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-auto">
          <label
            htmlFor="user"
            className="block text-xs font-medium text-slate-500"
          >
            User
          </label>
          <select
            id="user"
            name="user"
            defaultValue={userIdFilter ?? ""}
            className="mt-1 w-full max-w-full truncate rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-auto">
          <label
            htmlFor="from"
            className="block text-xs font-medium text-slate-500"
          >
            From
          </label>
          <input
            type="date"
            id="from"
            name="from"
            defaultValue={fromStr ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
          />
        </div>
        <div className="sm:w-auto">
          <label
            htmlFor="to"
            className="block text-xs font-medium text-slate-500"
          >
            To
          </label>
          <input
            type="date"
            id="to"
            name="to"
            defaultValue={toStr ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Apply
        </button>
        {(actionFilter || userIdFilter || hasDateFilter) && (
          <Link
            href="/audit"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
          No activity matches these filters.
        </p>
      ) : (
        <Table>
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <Th>When</Th>
              <Th>Action</Th>
              <Th>Description</Th>
              <Th>By</Th>
              <Th>Subject</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const subject = subjectFor(r);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td label="When" className="whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(r.createdAt)}
                  </Td>
                  <Td label="Action">
                    <Badge tone="indigo">{r.action}</Badge>
                  </Td>
                  <Td label="Description">
                    {r.description}
                    {r.note && r.note.startsWith("importRunId:") ? (
                      <>
                        {" "}
                        <Link
                          href={`/jobs/imports/${r.note.slice("importRunId:".length)}`}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          (open import run)
                        </Link>
                      </>
                    ) : null}
                  </Td>
                  <Td label="By">{r.performedBy.fullName}</Td>
                  <Td label="Subject">
                    {subject ? (
                      subject.href ? (
                        <Link
                          href={subject.href}
                          className="text-indigo-600 hover:underline"
                        >
                          {subject.label} ↗
                        </Link>
                      ) : (
                        <span className="text-slate-700">{subject.label}</span>
                      )
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Pagination
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      />
    </div>
  );
}
