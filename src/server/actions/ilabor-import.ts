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
  /** True when iLabor's mapped status differs from the existing LuminTrack
   *  status (only set for "updated" rows — re-imports preserve LuminTrack's
   *  status, so this warns the operator that the two are out of sync). */
  statusDiverged?: boolean;
  /** The existing LuminTrack status, for display alongside the iLabor one. */
  existingStatus?: string | null;
  /** True when the existing job's title differs materially from the incoming
   *  row's title. Possible silent ID re-use by iLabor; the operator should
   *  confirm before committing. */
  titleDrifted?: boolean;
  /** The existing LuminTrack job title, for the side-by-side comparison. */
  existingTitle?: string | null;
  /** True when the existing job's client (customer) name differs from the
   *  incoming row's customer. Same silent-re-use risk as titleDrifted. */
  customerDrifted?: boolean;
  /** The existing LuminTrack client name, for side-by-side comparison. */
  existingCustomer?: string | null;
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
  /** Net-new Vendor names (no case-insensitive match in DB). Surfaced so the
   *  operator can spot a likely-rename like "RANDSTAD" → "Randstad Technologies"
   *  before committing — otherwise a true rename creates an orphan row. */
  newVendorNames?: string[];
  /** Same idea for Client. */
  newClientNames?: string[];
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
  // First-occurrence wins. If a captured file contains duplicate
  // requisitionIds (e.g. concatenated paginated captures, or an iLabor bug),
  // the upsert loop would otherwise process the same Job twice — second
  // would silently overwrite the first and could mask the title-drift
  // warning. We keep the first occurrence as the authoritative one and
  // emit per-row errors for the rest so they show up in the skipped list.
  const seenReqIds = new Set<string>();
  rows.forEach((row, rowIndex) => {
    const parsed = ilaborRowSchema.safeParse(row);
    if (parsed.success) {
      const reqId = String(parsed.data.requisitionId);
      if (seenReqIds.has(reqId)) {
        errors.push({
          rowIndex,
          reason: `Duplicate requisitionId "${reqId}" — already present earlier in this file. Skipping.`,
          hint: `${reqId} · ${parsed.data.jobTitle}`,
        });
        return;
      }
      seenReqIds.add(reqId);
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
    submitLimit: row.submitLimit ?? null,
    ilaborSubmitOpen: row.submitStatus ?? null,
    ilaborScreenerCode: row.questionStatus ?? null,
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
    submitLimit: row.submitLimit ?? null,
    ilaborSubmitOpen: row.submitStatus ?? null,
    ilaborScreenerCode: row.questionStatus ?? null,
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
        select: {
          portalRefId: true,
          status: true,
          title: true,
          client: { select: { name: true } },
        },
      })
    : [];
  const existingByRefIdPreview = new Map(
    existing.map((j) => [j.portalRefId, j] as const),
  );
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
    const reqId = String(row.requisitionId);
    if (existingSet.has(reqId)) {
      const prior = existingByRefIdPreview.get(reqId) ?? null;
      const existingStatus = prior?.status ?? null;
      const mapped = ilaborStatusToJobStatus(row.requisitionStatus);
      // Only flag divergence when the iLabor side mapped cleanly — otherwise
      // the "unmapped" badge already covers the operator-surprise case.
      const diverged =
        !mapped.unknown &&
        existingStatus !== null &&
        existingStatus !== mapped.status;
      // Title / customer drift signals possible silent ID re-use by iLabor —
      // if the same requisitionId now points at a different role or a
      // different client, surface it before commit so the operator can confirm.
      const existingTitle = prior?.title ?? null;
      const existingCustomer = prior?.client.name ?? null;
      const titleDrifted =
        existingTitle !== null &&
        existingTitle.trim().toLowerCase() !== row.jobTitle.trim().toLowerCase();
      const customerDrifted =
        existingCustomer !== null &&
        existingCustomer.trim().toLowerCase() !==
          row.customerName.trim().toLowerCase();
      updatedRows.push({
        ...digest,
        existingStatus,
        statusDiverged: diverged,
        existingTitle,
        existingCustomer,
        titleDrifted,
        customerDrifted,
      });
    } else {
      newRows.push(digest);
    }
  });

  // Net-new Vendor/Client detection: for each unique incoming name, check
  // for a case-insensitive match in the DB. Names with no match would
  // create a new row at commit time — surface them so the operator can
  // spot a likely rename ("RANDSTAD" → "Randstad Technologies") before
  // it orphans every existing job.
  const incomingVendorNames = Array.from(
    new Set(valid.map((r) => (r.clientName || "").trim()).filter(Boolean)),
  );
  const incomingClientNames = Array.from(
    new Set(valid.map((r) => r.customerName.trim()).filter(Boolean)),
  );
  const [existingVendors, existingClients] = await Promise.all([
    prisma.vendor.findMany({ select: { name: true } }),
    prisma.client.findMany({ select: { name: true } }),
  ]);
  const vendorNameLower = new Set(existingVendors.map((v) => v.name.trim().toLowerCase()));
  const clientNameLower = new Set(existingClients.map((c) => c.name.trim().toLowerCase()));
  const newVendorNames = incomingVendorNames.filter(
    (n) => !vendorNameLower.has(n.toLowerCase()),
  );
  const newClientNames = incomingClientNames.filter(
    (n) => !clientNameLower.has(n.toLowerCase()),
  );

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
    newVendorNames,
    newClientNames,
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

  // Magic key shared with the import — kept identical so a stale
  // pg_try_advisory_xact_lock holder (from before this refactor) would
  // collide with us, not silently coexist.
  const LOCK_KEY = 817293744;

  // Phase A — session-scoped advisory lock. We can't use pg_try_advisory_xact_lock
  // anymore because we no longer have one long-lived transaction to attach it to;
  // the bulk loop is split into per-row mini transactions. A session-level lock
  // gives the same "one admin at a time" guarantee, but we MUST release it in
  // a finally block — sessions on Neon's pooled endpoint are recycled, but we
  // don't want to depend on that for correctness.
  let lockHeld = false;
  try {
    const lockRows = await prisma.$queryRaw<[{ ok: boolean }]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY}) AS ok
    `;
    if (!lockRows[0]?.ok) {
      return {
        status: "error",
        error: "Another import is already in progress. Please try again in a moment.",
      };
    }
    lockHeld = true;

    // Phase B — prep. Plain (un-wrapped) Prisma calls; each is its own implicit
    // transaction. The unique-on-name constraint on Vendor/Client (and the
    // session lock above) still protects against admin-vs-admin races.

    // B.1 Find-or-create the JobPortal row (defensive — seed should already have it).
    const portal = await prisma.jobPortal.upsert({
      where: { name: ILABOR_PORTAL_NAME },
      update: {},
      create: { name: ILABOR_PORTAL_NAME, kind: "VMS" },
    });

    // B.2 Pre-query existing portalRefIds so we can classify each row as
    //     NEW or UPDATE for the audit summary. We also load each existing
    //     job's current client/vendor names so the per-row loop can emit
    //     a JOB_UPDATED audit entry when iLabor renames or re-points the
    //     customer/vendor (otherwise the relationship change is silent —
    //     §F-D2 from the audit).
    const portalRefIds = valid.map((r) => String(r.requisitionId));
    const existing = await prisma.job.findMany({
      where: { portalId: portal.id, portalRefId: { in: portalRefIds } },
      select: {
        id: true,
        portalRefId: true,
        clientId: true,
        vendorId: true,
        title: true,
        client: { select: { name: true } },
        vendor: { select: { name: true } },
      },
    });
    const existingSet = new Set(existing.map((j) => j.portalRefId));
    const existingByRefId = new Map(
      existing
        .filter((j) => j.portalRefId !== null)
        .map((j) => [j.portalRefId as string, j] as const),
    );

    // B.3 Match-or-create Vendors and Clients. Case-INSENSITIVE (after trim)
    //     — without this, "RANDSTAD" today and "Randstad" tomorrow would
    //     create two Vendor rows, orphaning every job that pointed at the
    //     original. Postgres has no case-insensitive unique index here, so
    //     we pre-resolve each name via findFirst({ mode: "insensitive" })
    //     and only create when no existing row matches. The DB's
    //     unique-on-name constraint still protects against true races.
    const vendorNames = Array.from(
      new Set(
        valid.map((r) => (r.clientName || ILABOR_DEFAULT_VENDOR).trim()),
      ),
    );
    const vendorIdByName = new Map<string, string>();
    for (const name of vendorNames) {
      const found = await prisma.vendor.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (found) {
        vendorIdByName.set(name, found.id);
      } else {
        const v = await prisma.vendor.create({ data: { name } });
        vendorIdByName.set(name, v.id);
      }
    }

    const clientNames = Array.from(
      new Set(valid.map((r) => r.customerName.trim())),
    );
    const clientIdByName = new Map<string, string>();
    for (const name of clientNames) {
      const found = await prisma.client.findFirst({
        where: { name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (found) {
        clientIdByName.set(name, found.id);
      } else {
        const c = await prisma.client.create({ data: { name } });
        clientIdByName.set(name, c.id);
      }
    }

    // Phase C — per-row upserts. Each row's job.upsert + its audit row
    // commit together in their own mini transaction (~2–3 statements,
    // well under the 5s default budget). Cross-row atomicity is NOT
    // preserved by design — partial success on a 300-row bulk is more
    // useful than rolling back row 297's failure across the first 296.
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
      const prior = existingByRefId.get(String(row.requisitionId));

      // Pre-compute the drift diff outside the tx so the tx body stays minimal.
      const driftDiffs: string[] = [];
      let priorSnapshot: { title: string; clientName: string; vendorName: string } | null = null;
      if (!isNew && prior) {
        priorSnapshot = {
          title: prior.title,
          clientName: prior.client.name,
          vendorName: prior.vendor.name,
        };
        const titleChanged =
          prior.title.trim().toLowerCase() !==
          row.jobTitle.trim().toLowerCase();
        if (titleChanged)
          driftDiffs.push(`title "${prior.title}" → "${row.jobTitle}"`);
        if (prior.clientId !== clientId)
          driftDiffs.push(`client "${prior.client.name}" → "${clientName}"`);
        if (prior.vendorId !== vendorId)
          driftDiffs.push(`vendor "${prior.vendor.name}" → "${vendorName}"`);
      }

      await prisma.$transaction(async (tx) => {
        const upserted = await tx.job.upsert({
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
          select: { id: true },
        });

        if (isNew) {
          // Provenance entry on the new job's timeline — distinct from the
          // bulk REQUISITIONS_IMPORTED summary written after the loop.
          await logActivity(tx, {
            entityType: "JOB",
            action: "JOB_IMPORTED",
            jobId: upserted.id,
            description: `Imported from Randstad iLabor (Req ${String(row.requisitionId)})`,
            performedById: user.id,
          });
        } else if (priorSnapshot && driftDiffs.length) {
          // §F-D2 / §drift — surface title / client / vendor changes so a
          // silent ID re-use by iLabor (or a real rename) is visible on
          // the timeline rather than overwriting unaudited.
          await logActivity(tx, {
            entityType: "JOB",
            action: "JOB_UPDATED",
            jobId: upserted.id,
            description: `iLabor re-import drift: ${driftDiffs.join(", ")}`,
            oldValue: `${priorSnapshot.title} | ${priorSnapshot.clientName} / ${priorSnapshot.vendorName}`,
            newValue: `${row.jobTitle} | ${clientName} / ${vendorName}`,
            performedById: user.id,
          });
        }
      });

      if (isNew) createdCount += 1;
      else updatedCount += 1;
    }

    // Phase D — summary audit row. Job-less by design (bulk action; the
    // Activity model permits null jobId). Un-wrapped — a single insert.
    const activity = await logActivity(prisma, {
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
  } catch (err) {
    // Surface any throw as a wizard-friendly error instead of a 500.
    const message =
      err instanceof Error
        ? err.message
        : "Import failed. Please retry; if it persists, contact an admin.";
    return { status: "error", error: message };
  } finally {
    if (lockHeld) {
      // Best-effort release. If this fails the lock will still drop when
      // the pooled connection is reset, but we always try cleanly first.
      try {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      } catch {
        // Swallow — lock release failures shouldn't mask import success.
      }
    }
  }

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
