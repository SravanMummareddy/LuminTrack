import { z } from "zod";
import type { JobStatus } from "@/generated/prisma/enums";
import {
  ILABOR_FORMAT_VERSION,
  ILABOR_SOURCE_IDENTIFIER,
} from "@/lib/import/ilabor-format";

/**
 * Runtime validation for the iLabor import file.
 *
 * The envelope schema (`ilaborFileSchema`) checks the wrapper (source, version,
 * capturedAt, rows-is-array). The row schema (`ilaborRowSchema`) checks each
 * requisition entry. The Server Action will run `ilaborRowSchema.safeParse()`
 * per row so a single malformed row doesn't kill the whole import — bad rows
 * are reported back to the user instead.
 */

// ─── Local preprocess helpers (mirroring common.ts style) ───────────────────

/** Treat null / undefined / blank string as absent so `.optional()` catches them. */
function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/**
 * Strip currency-format noise ("$", ",", whitespace) from a string before
 * coercing to a number. iLabor's JSON sends `c2crate` as a number today, but
 * the extension might forward a stringified value — this keeps both shapes
 * valid without surprising the importer.
 */
function stripCurrency(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/[$,\s]/g, "");
  }
  return value;
}

const optionalTrimmedString = z.preprocess(
  blankToUndefined,
  z.string().trim().max(500).optional(),
);

const optionalInt = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().nonnegative().optional(),
);

const optionalCurrency = z.preprocess(
  (v) => blankToUndefined(stripCurrency(v)),
  z.coerce.number().nonnegative().optional(),
);

/**
 * iLabor sends ISO-ish strings without a timezone (e.g. "2026-05-22T16:25:14").
 * `z.coerce.date()` parses them as local time, which matches what recruiters
 * see in iLabor's UI. Acceptable for display; we don't do timezone-sensitive
 * math on these.
 */
const optionalIsoDate = z.preprocess(
  blankToUndefined,
  z.coerce.date().optional(),
);

// ─── Per-row schema ─────────────────────────────────────────────────────────

/**
 * One requisition row. Field names mirror iLabor's `requisitionViewList[]`
 * verbatim. `.passthrough()` preserves any extra iLabor fields the extension
 * forwards so they're available later if we ever decide to use them.
 */
export const ilaborRowSchema = z
  .object({
    // requisitionId can arrive as number (159263) or string ("159263"). We
    // string-ify so it slots into Prisma's `portalRefId String?` cleanly.
    requisitionId: z.preprocess(
      (v) => (typeof v === "number" ? String(v) : v),
      z.string().trim().min(1, "requisitionId is required").max(64),
    ),
    jobTitle: z.string().trim().min(1, "jobTitle is required").max(500),
    customerName: z
      .string()
      .trim()
      .min(1, "customerName is required")
      .max(200),
    clientName: z
      .string()
      .trim()
      .min(1, "clientName is required")
      .max(200),

    customerRefNo: optionalTrimmedString,
    location: optionalTrimmedString,
    c2crate: optionalCurrency,
    noOfPositions: optionalInt,
    noOfSubmissions: optionalInt,
    noOfActiveSubmissions: optionalInt,
    projectDuration: optionalTrimmedString,
    projectedStartDate: optionalIsoDate,
    projectedEndDate: optionalIsoDate,
    releaseDate: optionalIsoDate,
    createDate: optionalIsoDate,
    requisitionStatus: optionalTrimmedString,
    assignedTo: optionalTrimmedString,
    accountManager: optionalTrimmedString,
    alternateEmail: optionalTrimmedString,
    positionType: optionalTrimmedString,
    department: optionalTrimmedString,
    // ── iLabor "signal" fields. Captured raw; semantics inferred from data:
    // submitStatus is a 0/1 flag (closed/open for subs) in the sample.
    // questionStatus is 0 or a small int (>0 means screener attached).
    // submitLimit is the per-req max submissions (uniform 30 in sample).
    submitLimit: optionalInt,
    submitStatus: optionalInt,
    questionStatus: optionalInt,
  })
  .passthrough();

/** Parsed row — all fields have been normalised + typed. */
export type IlaborRow = z.infer<typeof ilaborRowSchema>;

// ─── Envelope schema ────────────────────────────────────────────────────────

/**
 * The full file. `rows` is intentionally typed as `unknown[]` here so the
 * envelope passes even when individual rows are malformed; the action then
 * validates each row separately with `ilaborRowSchema.safeParse(row)` and
 * surfaces row-level errors in the preview.
 */
export const ilaborFileSchema = z.object({
  source: z.literal(ILABOR_SOURCE_IDENTIFIER),
  version: z.literal(ILABOR_FORMAT_VERSION),
  capturedAt: z.string().trim().min(1, "capturedAt is required"),
  totalRecords: z.number().int().nonnegative().optional(),
  rows: z.array(z.unknown()),
});

export type IlaborFile = z.infer<typeof ilaborFileSchema>;

// ─── Status mapping ─────────────────────────────────────────────────────────

/**
 * Map iLabor's free-text `requisitionStatus` to LuminTrack's `JobStatus` enum.
 *
 * Returns `unknown: true` when the input doesn't match any known value, so the
 * importer can surface a per-row warning. The job is still created (defaulted
 * to OPEN) — we'd rather have it visible-with-warning than silently dropped.
 *
 * "Not Filled" maps to OPEN: the requisition is still live and recruiters can
 * keep submitting. Subject to product-owner confirmation on the first real
 * import — if "Not Filled" should be treated as terminal, change this to
 * CLOSED here and re-run.
 */
export function ilaborStatusToJobStatus(
  raw: string | null | undefined,
): { status: JobStatus; unknown: boolean } {
  const trimmed = (raw ?? "").trim().toLowerCase();
  switch (trimmed) {
    case "open":
      return { status: "OPEN", unknown: false };
    case "on hold":
    case "onhold":
      return { status: "ON_HOLD", unknown: false };
    case "filled":
      return { status: "FILLED", unknown: false };
    case "closed":
      return { status: "CLOSED", unknown: false };
    case "cancelled":
    case "canceled":
      return { status: "CANCELLED", unknown: false };
    case "not filled":
      return { status: "OPEN", unknown: false };
    default:
      return { status: "OPEN", unknown: true };
  }
}
