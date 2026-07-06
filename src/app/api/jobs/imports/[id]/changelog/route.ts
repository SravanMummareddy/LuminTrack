import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { prisma } from "@/server/db";
import { logActivity } from "@/server/activity";

export const dynamic = "force-dynamic";

type Summary = {
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  erroredCount?: number;
  statusWarningCount?: number;
  capturedAt?: string;
  runStartedAt?: string;
};

function formatTimestamp(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function displayJob(job: {
  seq: number;
  portalRefId: string | null;
}): string {
  return job.portalRefId
    ? `REQ-${job.portalRefId}`
    : `JOB-${String(job.seq).padStart(5, "0")}`;
}

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasFullAccess(user)) return new Response("Forbidden", { status: 403 });

  const { id } = await context.params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "txt";

  const runRow = await prisma.activity.findUnique({
    where: { id },
    include: { performedBy: { select: { fullName: true } } },
  });
  if (!runRow || runRow.action !== "REQUISITIONS_IMPORTED") {
    return new Response("Not found", { status: 404 });
  }

  const summary: Summary = (() => {
    if (!runRow.newValue) return {};
    try {
      return JSON.parse(runRow.newValue) as Summary;
    } catch {
      return {};
    }
  })();

  const rows = await prisma.activity.findMany({
    where: {
      note: `importRunId:${id}`,
      action: { in: ["JOB_IMPORTED", "JOB_UPDATED"] },
    },
    include: {
      job: {
        select: {
          seq: true,
          title: true,
          portalRefId: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: [{ action: "asc" }, { createdAt: "asc" }],
  });

  const createdRows = rows.filter((r) => r.action === "JOB_IMPORTED");
  const updatedRows = rows.filter((r) => r.action === "JOB_UPDATED");

  let body: string;
  let contentType: string;
  const dateStamp = runRow.createdAt.toISOString().slice(0, 10);
  const filename = `ilabor-changelog-${dateStamp}-${id.slice(0, 8)}.${format}`;

  if (format === "txt") {
    const lines: string[] = [];
    lines.push("LuminTrack — iLabor import change log");
    lines.push(`Run id:        ${id}`);
    lines.push(`Imported by:   ${runRow.performedBy?.fullName ?? "—"}`);
    lines.push(`Imported at:   ${formatTimestamp(runRow.createdAt)}`);
    if (summary.capturedAt) {
      lines.push(`Captured at:   ${formatTimestamp(new Date(summary.capturedAt))}`);
    }
    lines.push(
      `Result:        ${summary.createdCount ?? 0} new · ${summary.updatedCount ?? 0} changed · ${summary.unchangedCount ?? 0} unchanged · ${summary.erroredCount ?? 0} skipped`,
    );
    lines.push("");

    lines.push(`─── Changed jobs (${updatedRows.length}) ───`);
    if (updatedRows.length === 0) {
      lines.push("(none)");
    } else {
      for (const r of updatedRows) {
        const tag = r.job ? displayJob(r.job) : "(deleted)";
        const title = r.job?.title ?? "—";
        const client = r.job?.client.name ?? "—";
        lines.push(`${tag}  ${title}  (${client})`);
        const desc = r.description.startsWith("iLabor re-import: ")
          ? r.description.slice("iLabor re-import: ".length)
          : r.description;
        for (const d of desc.split(";").map((s) => s.trim()).filter(Boolean)) {
          lines.push(`    ${d}`);
        }
      }
    }
    lines.push("");

    lines.push(`─── New jobs (${createdRows.length}) ───`);
    if (createdRows.length === 0) {
      lines.push("(none)");
    } else {
      for (const r of createdRows) {
        const tag = r.job ? displayJob(r.job) : "(deleted)";
        const title = r.job?.title ?? "—";
        const client = r.job?.client.name ?? "—";
        lines.push(`${tag}  ${title}  (${client})`);
      }
    }
    lines.push("");

    body = lines.join("\n");
    contentType = "text/plain; charset=utf-8";
  } else {
    const out: string[] = [];
    out.push("displayId,title,client,changeType,field,old,new");

    for (const r of updatedRows) {
      const tag = r.job ? displayJob(r.job) : "";
      const title = r.job?.title ?? "";
      const client = r.job?.client.name ?? "";
      const desc = r.description.startsWith("iLabor re-import: ")
        ? r.description.slice("iLabor re-import: ".length)
        : r.description;
      const diffs = desc.split(";").map((s) => s.trim()).filter(Boolean);
      // Diff strings look like: 'vendor rate $48.00 → $50.00'
      for (const d of diffs) {
        const arrowIdx = d.indexOf(" → ");
        if (arrowIdx === -1) {
          out.push(
            [tag, title, client, "changed", d, "", ""]
              .map(csvEscape)
              .join(","),
          );
          continue;
        }
        const left = d.slice(0, arrowIdx);
        const right = d.slice(arrowIdx + 3);
        // Split label vs old value at the last space in `left`.
        const lastSpace = left.lastIndexOf(" ");
        const field = lastSpace === -1 ? left : left.slice(0, lastSpace);
        const oldVal = lastSpace === -1 ? "" : left.slice(lastSpace + 1);
        out.push(
          [tag, title, client, "changed", field, oldVal, right]
            .map(csvEscape)
            .join(","),
        );
      }
    }
    for (const r of createdRows) {
      const tag = r.job ? displayJob(r.job) : "";
      const title = r.job?.title ?? "";
      const client = r.job?.client.name ?? "";
      out.push(
        [tag, title, client, "new", "", "", ""].map(csvEscape).join(","),
      );
    }
    body = out.join("\n") + "\n";
    contentType = "text/csv; charset=utf-8";
  }

  await prisma.$transaction(async (tx) => {
    await logActivity(tx, {
      entityType: "JOB",
      action: "DATA_EXPORTED",
      description: `iLabor change log exported (.${format})`,
      note: `kind=ilabor-changelog;runId=${id};format=${format};bytes=${body.length}`,
      performedById: user.id,
    });
  });

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
