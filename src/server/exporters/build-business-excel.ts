/**
 * Excel workbook export. Two modes:
 *
 * - `business`   — no PII (email/phone/linkedin), no rates, no margin, no
 *                  Identity / Work Auth documents, no résumé Drive links.
 *                  Safe to share with non-finance stakeholders.
 * - `full`       — admin-only. Identical row coverage but PII + rates +
 *                  sensitive doc categories included.
 *
 * Each requested entity becomes one worksheet. Uses exceljs's streaming
 * `WorkbookWriter` so the workbook is written to the response stream as it's
 * built — large exports (50k+ rows) no longer hold the whole file in memory.
 */
import ExcelJS from "exceljs";
import { PassThrough, Readable } from "node:stream";
import { prisma } from "@/server/db";
import { isSensitiveCategory } from "@/lib/permissions";

export type ExcelMode = "business" | "full";

export const EXCEL_ENTITIES = [
  "jobs",
  "candidates",
  "submissions",
  "placements",
  "interviewRounds",
  "clients",
  "vendors",
  "sources",
  "recruiters",
  "resumes",
  "documents",
  "activity",
] as const;

export type ExcelEntity = (typeof EXCEL_ENTITIES)[number];

type SheetSpec = {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
};

function toNum(d: { toString(): string } | null | undefined): number | null {
  if (d === null || d === undefined) return null;
  const n = Number(d.toString());
  return Number.isFinite(n) ? n : null;
}

async function jobsSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.job.findMany({
    include: {
      client: { select: { name: true } },
      vendor: { select: { name: true } },
      sisterCompanySource: { select: { name: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { seq: "asc" },
  });
  return {
    name: "Jobs",
    columns: [
      { header: "Job ID", key: "displayId", width: 12 },
      { header: "Title", key: "title", width: 32 },
      { header: "Client", key: "client", width: 22 },
      { header: "Vendor", key: "vendor", width: 22 },
      { header: "Source", key: "source", width: 22 },
      { header: "Status", key: "status", width: 12 },
      { header: "Location", key: "location", width: 22 },
      { header: "Work mode", key: "workMode", width: 12 },
      { header: "Priority", key: "priority", width: 10 },
      { header: "Positions", key: "positions", width: 10 },
      { header: "Start date", key: "startDate", width: 14 },
      { header: "End date", key: "endDate", width: 14 },
      ...(mode === "full"
        ? [
            { header: "Vendor rate ($/hr)", key: "vendorRate", width: 14 },
          ]
        : []),
      { header: "Created by", key: "createdBy", width: 22 },
      { header: "Created at", key: "createdAt", width: 18 },
    ],
    rows: rows.map((j) => ({
      displayId: `JOB-${String(j.seq).padStart(5, "0")}`,
      title: j.title,
      client: j.client.name,
      vendor: j.vendor.name,
      source: j.sisterCompanySource?.name ?? j.sourceOther ?? "",
      status: j.status,
      location: j.location ?? "",
      workMode: j.workMode ?? "",
      priority: j.priority ?? "",
      positions: j.positions ?? "",
      startDate: j.startDate ?? "",
      endDate: j.endDate ?? "",
      vendorRate: toNum(j.vendorRate),
      createdBy: j.createdBy.fullName,
      createdAt: j.createdAt,
    })),
  };
}

async function candidatesSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.candidate.findMany({
    include: { createdBy: { select: { fullName: true } } },
    orderBy: { seq: "asc" },
  });
  return {
    name: "Candidates",
    columns: [
      { header: "Candidate ID", key: "displayId", width: 12 },
      { header: "Full name", key: "fullName", width: 28 },
      ...(mode === "full"
        ? [
            { header: "Email", key: "email", width: 28 },
            { header: "Phone", key: "phone", width: 16 },
            { header: "LinkedIn", key: "linkedin", width: 32 },
            { header: "Current location", key: "currentLocation", width: 22 },
          ]
        : []),
      { header: "Work auth", key: "workAuth", width: 16 },
      { header: "Experience (yrs)", key: "experience", width: 12 },
      { header: "Current company", key: "currentCompany", width: 24 },
      { header: "Skills", key: "skills", width: 36 },
      { header: "Status", key: "status", width: 14 },
      { header: "Tags", key: "tags", width: 24 },
      { header: "Source", key: "source", width: 18 },
      { header: "Last contacted", key: "lastContactedAt", width: 18 },
      { header: "Created by", key: "createdBy", width: 22 },
      { header: "Created at", key: "createdAt", width: 18 },
    ],
    rows: rows.map((c) => ({
      displayId: `CAND-${String(c.seq).padStart(4, "0")}`,
      fullName: c.fullName,
      email: c.email ?? "",
      phone: c.phone ?? "",
      linkedin: c.linkedinUrl ?? "",
      currentLocation: c.currentLocation ?? "",
      workAuth: c.workAuthorization ?? "",
      experience: toNum(c.totalExperienceYears),
      currentCompany: c.currentCompany ?? "",
      skills: c.skills.join(", "),
      status: c.status,
      tags: c.tags.join(", "),
      source: c.source ?? "",
      lastContactedAt: c.lastContactedAt ?? "",
      createdBy: c.createdBy.fullName,
      createdAt: c.createdAt,
    })),
  };
}

async function submissionsSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.submission.findMany({
    include: {
      candidate: { select: { fullName: true, seq: true } },
      job: { select: { title: true, seq: true, client: { select: { name: true } } } },
      submittedBy: { select: { fullName: true } },
    },
    orderBy: { seq: "asc" },
  });
  return {
    name: "Submissions",
    columns: [
      { header: "Submission ID", key: "displayId", width: 14 },
      { header: "Candidate", key: "candidate", width: 28 },
      { header: "Job", key: "job", width: 32 },
      { header: "Client", key: "client", width: 22 },
      { header: "Status", key: "status", width: 16 },
      { header: "Recruiter", key: "recruiter", width: 22 },
      { header: "Submitted at", key: "submittedAt", width: 18 },
      { header: "Expected join", key: "expectedJoinDate", width: 16 },
      { header: "Actual join", key: "actualJoinDate", width: 16 },
      { header: "Rejection reason", key: "rejectionReason", width: 24 },
      // Rates are sensitive — only the admin-only "full" export includes them.
      ...(mode === "full"
        ? [
            { header: "Pay rate ($/hr)", key: "payRate", width: 14 },
            { header: "Bill rate ($/hr)", key: "billRate", width: 14 },
            { header: "Client rate ($/hr)", key: "clientRate", width: 14 },
          ]
        : []),
    ],
    rows: rows.map((s) => ({
      displayId: `SUB-${String(s.seq).padStart(4, "0")}`,
      candidate: s.candidate.fullName,
      job: s.job.title,
      client: s.job.client.name,
      status: s.status,
      recruiter: s.submittedBy.fullName,
      submittedAt: s.submittedAt,
      expectedJoinDate: s.expectedJoinDate ?? "",
      actualJoinDate: s.actualJoinDate ?? "",
      rejectionReason: s.rejectionReason ?? "",
      ...(mode === "full"
        ? {
            payRate: toNum(s.payRate),
            billRate: toNum(s.billRate),
            clientRate: toNum(s.clientRate),
          }
        : {}),
    })),
  };
}

async function placementsSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.placement.findMany({
    include: {
      candidate: { select: { fullName: true } },
      job: { select: { title: true, client: { select: { name: true } } } },
      submission: { select: { submittedBy: { select: { fullName: true } } } },
    },
    orderBy: { seq: "asc" },
  });
  return {
    name: "Placements",
    columns: [
      { header: "Placement ID", key: "displayId", width: 12 },
      { header: "Candidate", key: "candidate", width: 28 },
      { header: "Job", key: "job", width: 32 },
      { header: "Client", key: "client", width: 22 },
      { header: "Recruiter", key: "recruiter", width: 22 },
      { header: "Start", key: "startDate", width: 14 },
      { header: "End", key: "endDate", width: 14 },
      { header: "Status", key: "status", width: 12 },
      ...(mode === "full"
        ? [
            { header: "Bill rate", key: "billRate", width: 12 },
            { header: "Pay rate", key: "payRate", width: 12 },
            { header: "Margin/hr", key: "margin", width: 12 },
          ]
        : []),
      { header: "Onsite manager", key: "onsiteManager", width: 24 },
      { header: "Client PO #", key: "po", width: 16 },
      { header: "End reason", key: "endReason", width: 18 },
    ],
    rows: rows.map((p) => {
      const bill = toNum(p.billRate) ?? 0;
      const pay = toNum(p.payRate) ?? 0;
      return {
        displayId: `PLC-${String(p.seq).padStart(3, "0")}`,
        candidate: p.candidate.fullName,
        job: p.job.title,
        client: p.job.client.name,
        recruiter: p.submission.submittedBy.fullName,
        startDate: p.startDate,
        endDate: p.endDate ?? "",
        status: p.status,
        billRate: bill,
        payRate: pay,
        margin: bill - pay,
        onsiteManager: p.onsiteManagerName ?? "",
        po: p.clientPoNumber ?? "",
        endReason: p.endReason ?? "",
      };
    }),
  };
}

async function interviewRoundsSheet(): Promise<SheetSpec> {
  const rows = await prisma.interviewRound.findMany({
    include: {
      submission: {
        select: {
          seq: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return {
    name: "Interview rounds",
    columns: [
      { header: "Submission", key: "submission", width: 14 },
      { header: "Candidate", key: "candidate", width: 28 },
      { header: "Job", key: "job", width: 32 },
      { header: "Round", key: "round", width: 8 },
      { header: "Type", key: "type", width: 14 },
      { header: "Scheduled at", key: "scheduledAt", width: 20 },
      { header: "Timezone", key: "tz", width: 18 },
      { header: "Result", key: "result", width: 14 },
      { header: "Feedback", key: "feedback", width: 40 },
    ],
    rows: rows.map((r) => ({
      submission: `SUB-${String(r.submission.seq).padStart(4, "0")}`,
      candidate: r.submission.candidate.fullName,
      job: r.submission.job.title,
      round: r.roundOrder,
      type: r.interviewType,
      scheduledAt: r.scheduledAt ?? "",
      tz: r.scheduledTimezone ?? "",
      result: r.result,
      feedback: r.feedback ?? "",
    })),
  };
}

async function clientsSheet(): Promise<SheetSpec> {
  const rows = await prisma.client.findMany({ orderBy: { name: "asc" } });
  return {
    name: "Clients",
    columns: [
      { header: "Name", key: "name", width: 28 },
      { header: "Active", key: "isActive", width: 8 },
      { header: "Notes", key: "notes", width: 40 },
    ],
    rows: rows.map((c) => ({ name: c.name, isActive: c.isActive, notes: c.notes ?? "" })),
  };
}

async function vendorsSheet(): Promise<SheetSpec> {
  const rows = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  return {
    name: "Vendors",
    columns: [
      { header: "Name", key: "name", width: 28 },
      { header: "Active", key: "isActive", width: 8 },
      { header: "Notes", key: "notes", width: 40 },
    ],
    rows: rows.map((v) => ({ name: v.name, isActive: v.isActive, notes: v.notes ?? "" })),
  };
}

async function sourcesSheet(): Promise<SheetSpec> {
  const rows = await prisma.sisterCompanySource.findMany({ orderBy: { name: "asc" } });
  return {
    name: "Sources",
    columns: [
      { header: "Name", key: "name", width: 28 },
      { header: "Active", key: "isActive", width: 8 },
    ],
    rows: rows.map((s) => ({ name: s.name, isActive: s.isActive })),
  };
}

async function recruitersSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.user.findMany({ orderBy: { fullName: "asc" } });
  return {
    name: "Recruiters",
    columns: [
      { header: "Full name", key: "fullName", width: 28 },
      ...(mode === "full" ? [{ header: "Email", key: "email", width: 32 }] : []),
      { header: "Role", key: "role", width: 12 },
      { header: "Active", key: "isActive", width: 8 },
      { header: "Created at", key: "createdAt", width: 18 },
    ],
    rows: rows.map((u) => ({
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
    })),
  };
}

async function resumesSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.candidateResume.findMany({
    include: { candidate: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    name: "Resumes",
    columns: [
      { header: "Candidate", key: "candidate", width: 28 },
      { header: "Label", key: "label", width: 24 },
      ...(mode === "full"
        ? [{ header: "File", key: "file", width: 40 }]
        : []),
      { header: "Created at", key: "createdAt", width: 18 },
    ],
    rows: rows.map((r) => ({
      candidate: r.candidate.fullName,
      label: r.label,
      file: r.blobPathname ?? "",
      createdAt: r.createdAt,
    })),
  };
}

async function documentsSheet(mode: ExcelMode): Promise<SheetSpec> {
  const rows = await prisma.candidateDocument.findMany({
    include: { candidate: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const filtered = mode === "business" ? rows.filter((d) => !isSensitiveCategory(d.category)) : rows;
  return {
    name: "Documents",
    columns: [
      { header: "Candidate", key: "candidate", width: 28 },
      { header: "Category", key: "category", width: 16 },
      { header: "Label", key: "label", width: 28 },
      ...(mode === "full" ? [{ header: "File", key: "file", width: 40 }] : []),
      { header: "Issued", key: "issuedAt", width: 14 },
      { header: "Expires", key: "expiresAt", width: 14 },
      { header: "Notes", key: "notes", width: 32 },
    ],
    rows: filtered.map((d) => ({
      candidate: d.candidate.fullName,
      category: d.category,
      label: d.label,
      file: d.blobPathname ?? "",
      issuedAt: d.issuedAt ?? "",
      expiresAt: d.expiresAt ?? "",
      notes: d.notes ?? "",
    })),
  };
}

async function activitySheet(): Promise<SheetSpec> {
  const rows = await prisma.activity.findMany({
    include: { performedBy: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  return {
    name: "Activity (last 5k)",
    columns: [
      { header: "Timestamp", key: "createdAt", width: 20 },
      { header: "User", key: "user", width: 22 },
      { header: "Entity", key: "entityType", width: 14 },
      { header: "Action", key: "action", width: 28 },
      { header: "Description", key: "description", width: 60 },
      { header: "Note", key: "note", width: 30 },
    ],
    rows: rows.map((a) => ({
      createdAt: a.createdAt,
      user: a.performedBy.fullName,
      entityType: a.entityType,
      action: a.action,
      description: a.description,
      note: a.note ?? "",
    })),
  };
}

async function buildSheet(entity: ExcelEntity, mode: ExcelMode): Promise<SheetSpec | null> {
  switch (entity) {
    case "jobs":
      return jobsSheet(mode);
    case "candidates":
      return candidatesSheet(mode);
    case "submissions":
      return submissionsSheet(mode);
    case "placements":
      return placementsSheet(mode);
    case "interviewRounds":
      return interviewRoundsSheet();
    case "clients":
      return clientsSheet();
    case "vendors":
      return vendorsSheet();
    case "sources":
      return sourcesSheet();
    case "recruiters":
      return recruitersSheet(mode);
    case "resumes":
      // Business mode excludes resumes (Drive links are PII-adjacent).
      return mode === "full" ? resumesSheet(mode) : null;
    case "documents":
      return documentsSheet(mode);
    case "activity":
      // Activity log is admin-only territory; skip in business mode.
      return mode === "full" ? activitySheet() : null;
  }
}

/**
 * Streams a workbook through the returned Node Readable. Work runs in the
 * background — the caller pipes the stream to the HTTP response. Errors
 * destroy the stream so consumers see a failed download rather than a
 * truncated-but-OK xlsx. Callers that want the full Buffer (tests,
 * background jobs) should use `buildBusinessExcelBuffer` instead.
 */
export function streamBusinessExcel(args: {
  mode: ExcelMode;
  entities: ExcelEntity[];
}): Readable {
  const pass = new PassThrough();
  void writeWorkbook(args, pass).catch((err) => pass.destroy(err));
  return pass;
}

async function writeWorkbook(
  args: { mode: ExcelMode; entities: ExcelEntity[] },
  stream: PassThrough,
): Promise<void> {
  // useStyles is required for column widths + bold header to survive
  // streaming. useSharedStrings keeps cell-string memory bounded.
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true,
    useSharedStrings: true,
  });
  wb.created = new Date();
  wb.creator = "LuminTrack";

  for (const entity of args.entities) {
    const spec = await buildSheet(entity, args.mode);
    if (!spec) continue;
    // WorksheetWriter rejects `ws.views = ...` (read-only in streaming mode);
    // freeze-header lives in the addWorksheet options instead.
    const ws = wb.addWorksheet(spec.name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = spec.columns;
    ws.getRow(1).font = { bold: true };
    // .commit() on each row flushes it to disk; .commit() on the worksheet
    // closes the sheet so subsequent sheets can stream independently.
    for (const row of spec.rows) ws.addRow(row).commit();
    await ws.commit();
  }

  await wb.commit();
}
