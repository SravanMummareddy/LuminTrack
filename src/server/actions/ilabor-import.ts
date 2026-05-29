"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/server/activity";
import { ensureSourceForPortal } from "@/server/portals";
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
    /** Existing rows where at least one iLabor-owned field will change. */
    updatedCount: number;
    /** Existing rows where every iLabor-owned field matches our stored
     *  value — committing will only bump `lastImportedAt`, no audit row. */
    unchangedCount: number;
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
  /** Managed Source this import will attribute new jobs to. Mirrors the portal
   *  name. `status` is "existing" if the SisterCompanySource row already exists,
   *  "will-create" if the importer will create it on commit. Surfaced so the
   *  admin sees which Source the run lands on before clicking Confirm. */
  source?: { name: string; status: "existing" | "will-create" };
};

export type IlaborImportResultState = {
  status: "idle" | "success" | "error";
  error?: string;
  result?: {
    createdCount: number;
    updatedCount: number;
    /** Rows iLabor sent that exactly matched our stored values — no
     *  per-field write, no JOB_UPDATED audit, just a `lastImportedAt` bump. */
    unchangedCount: number;
    erroredCount: number;
    statusWarningCount: number;
    /** Activity row id, for linking to the timeline / drill-down. */
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

// ─── Field-level diff (re-import → per-field change detection) ─────────────

/**
 * Human labels for every iLabor-owned Job column the importer touches on the
 * update path. Used both to compare prior-vs-incoming and to render readable
 * diff strings for the JOB_UPDATED audit row. `client` and `vendor` are
 * tracked separately in the per-row branch because they're FK fields, not
 * Job columns directly.
 */
const DIFFABLE_FIELDS = {
  title: "title",
  location: "location",
  vendorRate: "vendor rate",
  atsId: "ATS id",
  startDate: "start date",
  endDate: "end date",
  durationLabel: "duration",
  positions: "positions",
  externalSubsCount: "iLabor subs count",
  externalActiveCount: "iLabor active count",
  releasedDate: "released date",
  assignedToName: "assigned to",
  ownerName: "owner",
  ownerAltEmail: "owner alt email",
  reqType: "req type",
  department: "department",
  externalStatusRaw: "iLabor status",
  externalCreatedDate: "iLabor created date",
  submitLimit: "submission cap",
  ilaborSubmitOpen: "iLabor submit flag",
  ilaborScreenerCode: "iLabor screener code",
} as const;

type DiffKey = keyof typeof DIFFABLE_FIELDS;

const DATE_KEYS: ReadonlySet<DiffKey> = new Set([
  "startDate",
  "endDate",
  "releasedDate",
  "externalCreatedDate",
]);
const DECIMAL_KEYS: ReadonlySet<DiffKey> = new Set(["vendorRate"]);

function fieldEq(key: DiffKey, a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (DATE_KEYS.has(key)) {
    const aT = a instanceof Date ? a.getTime() : new Date(String(a)).getTime();
    const bT = b instanceof Date ? b.getTime() : new Date(String(b)).getTime();
    return aT === bT;
  }
  if (DECIMAL_KEYS.has(key)) {
    return Number(a.toString()).toFixed(2) === Number(b.toString()).toFixed(2);
  }
  return a === b;
}

function fmtField(key: DiffKey, v: unknown): string {
  if (v == null) return "—";
  if (DATE_KEYS.has(key)) {
    const d = v instanceof Date ? v : new Date(String(v));
    return d.toISOString().slice(0, 10);
  }
  if (DECIMAL_KEYS.has(key)) {
    return `$${Number(v.toString()).toFixed(2)}`;
  }
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function serializeForAudit(obj: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) out[k] = null;
    else if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === "object") out[k] = v.toString();
    else out[k] = v;
  }
  return JSON.stringify(out);
}

/**
 * Compare an existing Job's iLabor-owned columns to the incoming update
 * payload. Returns the subset of fields that actually changed plus a list
 * of human-readable diff strings. `lastImportedAt` is the heartbeat field
 * and is intentionally not included.
 */
function diffJobFields(
  prior: Record<DiffKey, unknown>,
  next: Record<DiffKey, unknown>,
): { changed: Partial<Record<DiffKey, unknown>>; diffs: string[] } {
  const changed: Partial<Record<DiffKey, unknown>> = {};
  const diffs: string[] = [];
  for (const key of Object.keys(DIFFABLE_FIELDS) as DiffKey[]) {
    const p = prior[key];
    const n = next[key];
    if (!fieldEq(key, p, n)) {
      changed[key] = n;
      diffs.push(`${DIFFABLE_FIELDS[key]} ${fmtField(key, p)} → ${fmtField(key, n)}`);
    }
  }
  return { changed, diffs };
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
          clientId: true,
          vendorId: true,
          client: { select: { name: true } },
          vendor: { select: { name: true } },
          // Diffable iLabor-owned columns so the preview can classify
          // updated-vs-unchanged the same way the importer will at commit.
          location: true,
          vendorRate: true,
          atsId: true,
          startDate: true,
          endDate: true,
          durationLabel: true,
          positions: true,
          externalSubsCount: true,
          externalActiveCount: true,
          releasedDate: true,
          assignedToName: true,
          ownerName: true,
          ownerAltEmail: true,
          reqType: true,
          department: true,
          externalStatusRaw: true,
          externalCreatedDate: true,
          submitLimit: true,
          ilaborSubmitOpen: true,
          ilaborScreenerCode: true,
        },
      })
    : [];
  const existingByRefIdPreview = new Map(
    existing.map((j) => [j.portalRefId, j] as const),
  );
  const existingSet = new Set(existing.map((j) => j.portalRefId));

  const newRows: RowDigest[] = [];
  const updatedRows: RowDigest[] = [];
  let unchangedCount = 0;
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

      // Same diff the importer will run at commit time — split this row
      // into the updated vs. unchanged bucket so the preview summary
      // matches the post-commit result.
      let hasChanges = true;
      if (prior) {
        const nextForDiff = withoutInternal(jobUpdateFields(row)) as unknown as Record<
          DiffKey,
          unknown
        >;
        const priorForDiff = prior as unknown as Record<DiffKey, unknown>;
        const { diffs } = diffJobFields(priorForDiff, nextForDiff);
        const priorVendorName = prior.vendor?.name ?? null;
        const priorClientName = prior.client?.name ?? null;
        const incomingVendor = (row.clientName || ILABOR_DEFAULT_VENDOR).trim();
        const incomingClient = row.customerName.trim();
        const vendorChanged =
          (priorVendorName ?? "").trim().toLowerCase() !==
          incomingVendor.toLowerCase();
        const clientChanged =
          (priorClientName ?? "").trim().toLowerCase() !==
          incomingClient.toLowerCase();
        hasChanges = diffs.length > 0 || vendorChanged || clientChanged;
      }

      if (hasChanges) {
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
        unchangedCount += 1;
      }
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

  // Source mirror — read-only at preview time. We resolve the *portal* name
  // (whether or not it exists yet) and check whether a same-named
  // SisterCompanySource is already in the DB. If not, the commit step will
  // create it via ensureSourceForPortal.
  const existingSource = await prisma.sisterCompanySource.findUnique({
    where: { name: ILABOR_PORTAL_NAME },
    select: { id: true },
  });
  const source = {
    name: ILABOR_PORTAL_NAME,
    status: (existingSource ? "existing" : "will-create") as
      | "existing"
      | "will-create",
  };

  return {
    status: "ready",
    summary: {
      totalRows: envelope.rows.length,
      newCount: newRows.length,
      updatedCount: updatedRows.length,
      unchangedCount,
      erroredCount: errors.length,
      statusWarningCount,
      capturedAt: envelope.capturedAt,
    },
    newRows,
    updatedRows,
    errorRows: errors,
    newVendorNames,
    newClientNames,
    source,
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
  let unchangedCount = 0;
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

    // B.0 Pre-create the summary REQUISITIONS_IMPORTED Activity row so every
    //     per-row JOB_IMPORTED / JOB_UPDATED audit written inside the loop
    //     can stamp `note: "importRunId:<id>"`. The drill-down page and the
    //     downloadable change log group entries by this id. Counts here are
    //     placeholders — the row is updated at the end of Phase D with the
    //     final summary. If the run crashes mid-way the placeholder row
    //     stays in /jobs/imports as "iLabor import in progress…" — useful
    //     signal that something didn't finish.
    const runStartedAt = new Date();
    const summaryRow = await prisma.activity.create({
      data: {
        entityType: "JOB",
        action: "REQUISITIONS_IMPORTED",
        description: "iLabor import in progress…",
        performedById: user.id,
        newValue: JSON.stringify({
          capturedAt: envelope.capturedAt,
          runStartedAt: runStartedAt.toISOString(),
        }),
      },
    });
    const importRunId = summaryRow.id;
    activityId = importRunId;
    const runNote = `importRunId:${importRunId}`;

    // B.1 Find-or-create the JobPortal row (defensive — seed should already have it).
    const portal = await prisma.jobPortal.upsert({
      where: { name: ILABOR_PORTAL_NAME },
      update: {},
      create: { name: ILABOR_PORTAL_NAME, kind: "VMS" },
    });
    // Mirror the portal as a managed Source so it appears under Settings →
    // Sources and the /jobs Source filter. Attribution is one-way: we set
    // sisterCompanySourceId on the create path below, but NOT on update —
    // an admin may have hand-re-pointed a job and we don't silently revert.
    const sourceId = await ensureSourceForPortal(prisma, portal.name);

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
        // Diffable iLabor-owned columns — loaded so the per-row branch can
        // compute a no-write vs. partial-update vs. full-update decision
        // without an extra round trip.
        location: true,
        vendorRate: true,
        atsId: true,
        startDate: true,
        endDate: true,
        durationLabel: true,
        positions: true,
        externalSubsCount: true,
        externalActiveCount: true,
        releasedDate: true,
        assignedToName: true,
        ownerName: true,
        ownerAltEmail: true,
        reqType: true,
        department: true,
        externalStatusRaw: true,
        externalCreatedDate: true,
        submitLimit: true,
        ilaborSubmitOpen: true,
        ilaborScreenerCode: true,
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
      const updatePayload = withoutInternal(jobUpdateFields(row));
      if (createPayload._statusUnknown) statusWarningCount += 1;

      const isNew = !existingSet.has(String(row.requisitionId));
      const prior = existingByRefId.get(String(row.requisitionId));

      if (isNew) {
        // CREATE path — unchanged from before, plus importRunId stamp on
        // the per-job audit so the drill-down + downloadable log can find
        // new jobs from this run.
        await prisma.$transaction(async (tx) => {
          const upserted = await tx.job.create({
            data: {
              ...withoutInternal(createPayload),
              portalId: portal.id,
              sisterCompanySourceId: sourceId,
              clientId,
              vendorId,
              createdById: user.id,
            },
            select: { id: true },
          });
          await logActivity(tx, {
            entityType: "JOB",
            action: "JOB_IMPORTED",
            jobId: upserted.id,
            description: `Imported from Randstad iLabor (Req ${String(row.requisitionId)})`,
            note: runNote,
            performedById: user.id,
          });
        });
        createdCount += 1;
        continue;
      }

      // UPDATE path — diff fields first; skip the write entirely when
      // nothing changed except the heartbeat.
      if (!prior) {
        // Defensive — existingSet says yes but the map miss. Shouldn't happen.
        throw new Error(`Internal: prior snapshot missing for req ${row.requisitionId}`);
      }

      const priorForDiff = prior as unknown as Record<DiffKey, unknown>;
      const nextForDiff = updatePayload as unknown as Record<DiffKey, unknown>;
      const { changed, diffs } = diffJobFields(priorForDiff, nextForDiff);

      const clientChanged = prior.clientId !== clientId;
      const vendorChanged = prior.vendorId !== vendorId;
      if (clientChanged) {
        diffs.push(`client "${prior.client.name}" → "${clientName}"`);
      }
      if (vendorChanged) {
        diffs.push(`vendor "${prior.vendor.name}" → "${vendorName}"`);
      }
      const totalChanges =
        Object.keys(changed).length + (clientChanged ? 1 : 0) + (vendorChanged ? 1 : 0);

      if (totalChanges === 0) {
        // No-op except heartbeat. Single-column UPDATE, no audit row.
        // lastImportedAt MUST still bump or listStaleIlaborJobs would
        // false-positive every unchanged row on the next run.
        await prisma.job.update({
          where: { id: prior.id },
          data: { lastImportedAt: new Date() },
        });
        unchangedCount += 1;
        continue;
      }

      const priorSubset: Record<string, unknown> = {};
      for (const k of Object.keys(changed)) {
        priorSubset[k] = (prior as unknown as Record<string, unknown>)[k];
      }
      if (clientChanged) priorSubset.clientName = prior.client.name;
      if (vendorChanged) priorSubset.vendorName = prior.vendor.name;

      const nextSubset: Record<string, unknown> = { ...changed };
      if (clientChanged) nextSubset.clientName = clientName;
      if (vendorChanged) nextSubset.vendorName = vendorName;

      // Build the typed update payload by picking the changed keys out of
      // the fully-typed updatePayload (rather than from the loosely-typed
      // diff result). Keeps Prisma's input types intact.
      const updateData: Partial<typeof updatePayload> = {};
      for (const k of Object.keys(changed) as DiffKey[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updateData as any)[k] = (updatePayload as Record<string, unknown>)[k];
      }
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: prior.id },
          data: {
            ...updateData,
            ...(clientChanged ? { clientId } : {}),
            ...(vendorChanged ? { vendorId } : {}),
            lastImportedAt: new Date(),
          },
        });
        await logActivity(tx, {
          entityType: "JOB",
          action: "JOB_UPDATED",
          jobId: prior.id,
          description: `iLabor re-import: ${diffs.join("; ")}`,
          oldValue: serializeForAudit(priorSubset),
          newValue: serializeForAudit(nextSubset),
          note: runNote,
          performedById: user.id,
        });
      });
      updatedCount += 1;
    }

    // Phase D — finalize the summary row pre-created in Phase B.0.
    const summaryNote =
      [
        errors.length ? `${errors.length} rows skipped` : null,
        unchangedCount > 0 ? `${unchangedCount} unchanged` : null,
      ]
        .filter(Boolean)
        .join("; ");
    await prisma.activity.update({
      where: { id: importRunId },
      data: {
        description:
          `Imported ${createdCount} new + ${updatedCount} updated requisitions from Randstad iLabor` +
          (summaryNote ? ` (${summaryNote})` : ""),
        newValue: JSON.stringify({
          createdCount,
          updatedCount,
          unchangedCount,
          erroredCount: errors.length,
          statusWarningCount,
          capturedAt: envelope.capturedAt,
          runStartedAt: runStartedAt.toISOString(),
        }),
      },
    });
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
      unchangedCount,
      erroredCount: errors.length,
      statusWarningCount,
      activityId,
    },
  };
}
