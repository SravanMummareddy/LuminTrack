"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import {
  ilaborFileSchema,
  ilaborRowSchema,
  ilaborStatusToJobStatus,
  type IlaborRow,
} from "@/lib/validation/ilabor-import";

/**
 * Server Actions for the Randstad iLabor requisition importer.
 *
 *   previewRequisitions(formData) — read-only: validates the uploaded file and
 *   returns counts (new / updated / errored / status-warnings) plus a list of
 *   error rows. No DB writes.
 *
 *   importRequisitions(formData) — re-validates the same file and applies the
 *   changes inside one `prisma.$transaction`. Find-or-creates the JobPortal,
 *   Vendor, and Client rows; upserts each Job on the `(portalId, portalRefId)`
 *   composite unique key. Writes one REQUISITIONS_IMPORTED audit entry.
 *
 * Re-import behavior: when an existing job is updated, `status` is preserved
 * (LuminTrack's value, possibly hand-edited, is left alone). `externalStatusRaw`
 * always refreshes so the timeline still records what iLabor currently says.
 *
 * Auth: admin-only. Recruiters get an error response.
 */

const ILABOR_PORTAL_NAME = "Randstad iLabor";
/** Fallback vendor name used if a row is missing `clientName` (shouldn't happen). */
const ILABOR_DEFAULT_VENDOR = "RANDSTAD";

// ─── Result types ───────────────────────────────────────────────────────────

/** One row that failed validation — shown in the preview's error list. */
export type RowError = {
  rowIndex: number;
  /** The first user-readable message from Zod. */
  reason: string;
  /** Best-effort hint so the user can recognise the row (req id + title). */
  hint?: string;
};

/** Per-row digest for the preview's new / updated tables. */
export type RowDigest = {
  rowIndex: number;
  requisitionId: string;
  jobTitle: string;
  customerName: string;
  requisitionStatus: string | null;
  /** True when the status mapping fell through to OPEN with a warning. */
  statusUnknown: boolean;
};

export type IlaborImportPreviewState = {
  status: "idle" | "ready" | "error";
  error?: string;
  summary?: {
    totalRows: number;
    newCount: number;
    updatedCount: number;
    erroredCount: number;
    statusWarningCount: number;
    capturedAt: string;
  };
  newRows?: RowDigest[];
  updatedRows?: RowDigest[];
  errorRows?: RowError[];
};

export type IlaborImportResultState = {
  status: "idle" | "success" | "error";
  error?: string;
  result?: {
    createdCount: number;
    updatedCount: number;
    erroredCount: number;
    statusWarningCount: number;
    /** Activity row id, for linking to the timeline if we ever surface it. */
    activityId: string;
  };
};

// ─── Internal helpers (shared by preview + import) ──────────────────────────

/**
 * Pull the JSON file out of the form, parse it, and validate the envelope.
 * Returns a normalised envelope on success or a short error message on failure.
 * No per-row validation here — `validateRows` does that.
 */
async function readEnvelope(formData: FormData): Promise<
  | {
      ok: true;
      envelope: { source: string; version: number; capturedAt: string; rows: unknown[] };
    }
  | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose an iLabor JSON file to import." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "File is larger than 10 MB. Aborting as a safety check." };
  }

  let parsed: unknown;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Couldn't read the file — it isn't valid JSON." };
  }

  // Tolerant adapter: if the file looks like a raw iLabor API response
  // (has requisitionViewList[]), wrap it in the extension envelope so admins
  // can paste raw network captures directly. The browser extension will emit
  // the already-wrapped shape once it ships; that path skips this branch.
  if (
    parsed &&
    typeof parsed === "object" &&
    !("source" in parsed) &&
    Array.isArray((parsed as { requisitionViewList?: unknown }).requisitionViewList)
  ) {
    parsed = {
      source: "lumintrack-ilabor-extension",
      version: 1,
      capturedAt: new Date().toISOString(),
      rows: (parsed as { requisitionViewList: unknown[] }).requisitionViewList,
    };
  }

  const result = ilaborFileSchema.safeParse(parsed);
  if (!result.success) {
    // Surface the first envelope-level issue so the user knows it's the wrapper,
    // not the rows.
    const first = result.error.issues[0];
    const path = first.path.join(".") || "file";
    return { ok: false, error: `File envelope invalid (${path}): ${first.message}` };
  }
  return { ok: true, envelope: result.data };
}

/**
 * Per-row validation. Returns valid rows alongside any row-level errors,
 * preserving the original index so the preview can point the user at row N.
 */
function validateRows(rows: unknown[]): { valid: IlaborRow[]; errors: RowError[] } {
  const valid: IlaborRow[] = [];
  const errors: RowError[] = [];
  rows.forEach((row, rowIndex) => {
    const parsed = ilaborRowSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      const first = parsed.error.issues[0];
      const path = first.path.join(".") || "row";
      // Best-effort hint — extract requisitionId + jobTitle if present.
      const obj = (row ?? {}) as Record<string, unknown>;
      const hintReqId = obj.requisitionId != null ? String(obj.requisitionId) : "";
      const hintTitle = typeof obj.jobTitle === "string" ? obj.jobTitle : "";
      const hint = [hintReqId, hintTitle].filter(Boolean).join(" · ") || undefined;
      errors.push({
        rowIndex,
        reason: `${path}: ${first.message}`,
        hint,
      });
    }
  });
  return { valid, errors };
}

/** Build the `create` payload for a Job from a validated iLabor row. */
function jobCreateFields(row: IlaborRow) {
  const { status, unknown: statusUnknown } = ilaborStatusToJobStatus(
    row.requisitionStatus,
  );
  return {
    title: row.jobTitle,
    status,
    location: row.location ?? null,
    vendorRate: row.c2crate ?? null,
    portalRefId: String(row.requisitionId),
    atsId: row.customerRefNo ?? null,
    startDate: row.projectedStartDate ?? null,
    endDate: row.projectedEndDate ?? null,
    durationLabel: row.projectDuration ?? null,
    positions: row.noOfPositions ?? null,
    externalSubsCount: row.noOfSubmissions ?? null,
    externalActiveCount: row.noOfActiveSubmissions ?? null,
    releasedDate: row.releaseDate ?? null,
    assignedToName: row.assignedTo ?? null,
    ownerName: row.accountManager ?? null,
    ownerAltEmail: row.alternateEmail ?? null,
    reqType: row.positionType ?? null,
    department: row.department ?? null,
    externalStatusRaw: row.requisitionStatus ?? null,
    externalCreatedDate: row.createDate ?? null,
    lastImportedAt: new Date(),
    _statusUnknown: statusUnknown, // discarded by caller; kept here for type return
  };
}

/**
 * Build the `update` payload. NOTE: `status` is intentionally omitted — when a
 * job already exists, LuminTrack's status (possibly hand-edited) is preserved.
 * `externalStatusRaw` still refreshes so the audit trail captures what iLabor
 * currently says.
 */
function jobUpdateFields(row: IlaborRow) {
  const { unknown: statusUnknown } = ilaborStatusToJobStatus(row.requisitionStatus);
  return {
    title: row.jobTitle,
    location: row.location ?? null,
    vendorRate: row.c2crate ?? null,
    atsId: row.customerRefNo ?? null,
    startDate: row.projectedStartDate ?? null,
    endDate: row.projectedEndDate ?? null,
    durationLabel: row.projectDuration ?? null,
    positions: row.noOfPositions ?? null,
    externalSubsCount: row.noOfSubmissions ?? null,
    externalActiveCount: row.noOfActiveSubmissions ?? null,
    releasedDate: row.releaseDate ?? null,
    assignedToName: row.assignedTo ?? null,
    ownerName: row.accountManager ?? null,
    ownerAltEmail: row.alternateEmail ?? null,
    reqType: row.positionType ?? null,
    department: row.department ?? null,
    externalStatusRaw: row.requisitionStatus ?? null,
    externalCreatedDate: row.createDate ?? null,
    lastImportedAt: new Date(),
    _statusUnknown: statusUnknown,
  };
}

/** Strip our internal `_statusUnknown` marker before handing the payload to Prisma. */
function withoutInternal<T extends { _statusUnknown: boolean }>(
  fields: T,
): Omit<T, "_statusUnknown"> {
  const { _statusUnknown: _drop, ...rest } = fields;
  void _drop;
  return rest;
}

function digestOf(row: IlaborRow, rowIndex: number): RowDigest {
  const { unknown } = ilaborStatusToJobStatus(row.requisitionStatus);
  return {
    rowIndex,
    requisitionId: String(row.requisitionId),
    jobTitle: row.jobTitle,
    customerName: row.customerName,
    requisitionStatus: row.requisitionStatus ?? null,
    statusUnknown: unknown,
  };
}

// ─── previewRequisitions ────────────────────────────────────────────────────

export async function previewRequisitions(
  _prev: IlaborImportPreviewState,
  formData: FormData,
): Promise<IlaborImportPreviewState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { status: "error", error: "Only admins can import requisitions." };
  }

  const envelopeResult = await readEnvelope(formData);
  if (!envelopeResult.ok) {
    return { status: "error", error: envelopeResult.error };
  }
  const envelope = envelopeResult.envelope;

  const { valid, errors } = validateRows(envelope.rows);

  // Look up the JobPortal row (read-only). If it doesn't exist yet, all valid
  // rows are NEW by definition (this is a first-time import).
  const portal = await prisma.jobPortal.findUnique({
    where: { name: ILABOR_PORTAL_NAME },
    select: { id: true },
  });

  const portalRefIds = valid.map((r) => String(r.requisitionId));
  const existing = portal
    ? await prisma.job.findMany({
        where: {
          portalId: portal.id,
          portalRefId: { in: portalRefIds },
        },
        select: { portalRefId: true },
      })
    : [];
  const existingSet = new Set(existing.map((j) => j.portalRefId));

  const newRows: RowDigest[] = [];
  const updatedRows: RowDigest[] = [];
  let statusWarningCount = 0;

  valid.forEach((row, idxAmongValid) => {
    // rowIndex points back to the original `rows[]` position so the user can
    // find the row in the source file if needed.
    const rowIndex = envelope.rows.findIndex(
      (raw) =>
        typeof raw === "object" &&
        raw !== null &&
        String((raw as Record<string, unknown>).requisitionId ?? "") ===
          String(row.requisitionId),
    );
    void idxAmongValid;
    const digest = digestOf(row, rowIndex >= 0 ? rowIndex : -1);
    if (digest.statusUnknown) statusWarningCount += 1;
    if (existingSet.has(String(row.requisitionId))) {
      updatedRows.push(digest);
    } else {
      newRows.push(digest);
    }
  });

  return {
    status: "ready",
    summary: {
      totalRows: envelope.rows.length,
      newCount: newRows.length,
      updatedCount: updatedRows.length,
      erroredCount: errors.length,
      statusWarningCount,
      capturedAt: envelope.capturedAt,
    },
    newRows,
    updatedRows,
    errorRows: errors,
  };
}

// ─── importRequisitions ────────────────────────────────────────────────────

export async function importRequisitions(
  _prev: IlaborImportResultState,
  formData: FormData,
): Promise<IlaborImportResultState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { status: "error", error: "Only admins can import requisitions." };
  }

  const envelopeResult = await readEnvelope(formData);
  if (!envelopeResult.ok) {
    return { status: "error", error: envelopeResult.error };
  }
  const envelope = envelopeResult.envelope;
  const { valid, errors } = validateRows(envelope.rows);

  if (valid.length === 0) {
    return {
      status: "error",
      error:
        errors.length > 0
          ? `Every row failed validation (${errors.length} errors). Nothing imported.`
          : "The file contained no rows.",
    };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let statusWarningCount = 0;
  let activityId = "";

  await prisma.$transaction(
    async (tx) => {
      // 1. Find-or-create the JobPortal row (defensive — seed should already have).
      const portal = await tx.jobPortal.upsert({
        where: { name: ILABOR_PORTAL_NAME },
        update: {},
        create: { name: ILABOR_PORTAL_NAME, kind: "VMS" },
      });

      // 2. Pre-query existing portalRefIds so we can classify each row as
      //    NEW or UPDATE for the audit summary.
      const portalRefIds = valid.map((r) => String(r.requisitionId));
      const existing = await tx.job.findMany({
        where: { portalId: portal.id, portalRefId: { in: portalRefIds } },
        select: { portalRefId: true },
      });
      const existingSet = new Set(existing.map((j) => j.portalRefId));

      // 3. Dedupe-upsert Vendors and Clients so each unique name is touched
      //    exactly once. With ~300 rows this drops ~600 upserts to ~50.
      const vendorNames = Array.from(
        new Set(
          valid.map((r) => (r.clientName || ILABOR_DEFAULT_VENDOR).trim()),
        ),
      );
      const vendorIdByName = new Map<string, string>();
      for (const name of vendorNames) {
        const v = await tx.vendor.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        vendorIdByName.set(name, v.id);
      }

      const clientNames = Array.from(
        new Set(valid.map((r) => r.customerName.trim())),
      );
      const clientIdByName = new Map<string, string>();
      for (const name of clientNames) {
        const c = await tx.client.upsert({
          where: { name },
          update: {},
          create: { name },
        });
        clientIdByName.set(name, c.id);
      }

      // 4. Per-row Job upserts. Client + Vendor ids are pulled from the maps.
      for (const row of valid) {
        const vendorName = (row.clientName || ILABOR_DEFAULT_VENDOR).trim();
        const clientName = row.customerName.trim();
        const vendorId = vendorIdByName.get(vendorName);
        const clientId = clientIdByName.get(clientName);
        if (!vendorId || !clientId) {
          // Defensive — should be impossible since we just populated the maps.
          throw new Error(
            `Internal: missing org id for vendor="${vendorName}" / client="${clientName}"`,
          );
        }

        const createPayload = jobCreateFields(row);
        const updatePayload = jobUpdateFields(row);
        if (createPayload._statusUnknown) statusWarningCount += 1;

        const isNew = !existingSet.has(String(row.requisitionId));
        await tx.job.upsert({
          where: {
            portalId_portalRefId: {
              portalId: portal.id,
              portalRefId: String(row.requisitionId),
            },
          },
          create: {
            ...withoutInternal(createPayload),
            portalId: portal.id,
            clientId,
            vendorId,
            createdById: user.id,
          },
          update: {
            ...withoutInternal(updatePayload),
            clientId,
            vendorId,
          },
        });

        if (isNew) createdCount += 1;
        else updatedCount += 1;
      }

      // 4. One audit entry summarising the batch. Job-less by design — it's a
      //    bulk action; the Activity model permits null jobId.
      const activity = await logActivity(tx, {
        entityType: "JOB",
        action: "REQUISITIONS_IMPORTED",
        description:
          `Imported ${createdCount} new + ${updatedCount} updated requisitions from Randstad iLabor` +
          (errors.length ? ` (${errors.length} rows skipped)` : ""),
        performedById: user.id,
        newValue: JSON.stringify({
          createdCount,
          updatedCount,
          erroredCount: errors.length,
          statusWarningCount,
          capturedAt: envelope.capturedAt,
        }),
      });
      activityId = activity.id;
    },
    { timeout: 60_000 },
  );

  revalidatePath("/jobs");

  return {
    status: "success",
    result: {
      createdCount,
      updatedCount,
      erroredCount: errors.length,
      statusWarningCount,
      activityId,
    },
  };
}
