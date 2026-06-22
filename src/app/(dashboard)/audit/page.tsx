import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/ui/forbidden";
import { Table, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/session";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
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
  if (user.role !== "ADMIN") return <Forbidden />;

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

  const where = {
    ...(actionFilter
      ? { action: actionFilter as keyof typeof ActivityAction }
      : {}),
    ...(userIdFilter ? { performedById: userIdFilter } : {}),
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
        jobId: true,
        candidateId: true,
        submissionId: true,
        requirementId: true,
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

  function linkFor(r: (typeof rows)[number]): string | null {
    if (r.submissionId) return `/submissions/${r.submissionId}`;
    if (r.candidateId) return `/candidates/${r.candidateId}`;
    if (r.jobId) return `/jobs/${r.jobId}`;
    if (r.requirementId) return `/vendor-portal/${r.requirementId}`;
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
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
        <button
          type="submit"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Apply
        </button>
        {(actionFilter || userIdFilter) && (
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
              <Th>Entity</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const href = linkFor(r);
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
                  <Td label="Entity">
                    {href ? (
                      <Link
                        href={href}
                        className="text-indigo-600 hover:underline"
                      >
                        Open
                      </Link>
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
