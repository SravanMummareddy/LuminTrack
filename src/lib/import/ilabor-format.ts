/**
 * The contract between the iLabor browser extension and LuminTrack's importer.
 *
 * The extension captures the iLabor portal's `showrequisitionslist` JSON
 * response and produces a download file in this envelope shape. LuminTrack
 * validates the file with `ilaborFileSchema` in
 * `@/lib/validation/ilabor-import` before any DB write.
 *
 * When the row shape needs a breaking change, bump ILABOR_FORMAT_VERSION and
 * update the schema accordingly. The validator pins the version so an outdated
 * extension can't silently produce half-parsed imports.
 *
 * This file is intentionally dependency-free — it can be copy-pasted to the
 * extension repo as the shared interface.
 */

/** Bump on any breaking change to the row shape. The validator pins to this. */
export const ILABOR_FORMAT_VERSION = 1 as const;

/** Sentinel identifying the extension that produced the file. */
export const ILABOR_SOURCE_IDENTIFIER = "lumintrack-ilabor-extension";

/**
 * One row in `rows[]`. Field names mirror iLabor's `requisitionViewList[]`
 * exactly so the extension can pass the API response straight through with no
 * renaming. The extension is allowed to include any extra keys iLabor returns;
 * they are preserved but ignored on the LuminTrack side.
 *
 * Required: `requisitionId`, `jobTitle`, `customerName`, `clientName`.
 * Everything else is best-effort.
 */
export type IlaborImportRow = {
  /** iLabor's numeric req id (e.g. 159263). Sent as number or string. */
  requisitionId: number | string;
  jobTitle: string;
  /** The end employer — becomes LuminTrack's `Client` (e.g. "Ameren Ue US"). */
  customerName: string;
  /** iLabor's "client" — always "RANDSTAD" today. Becomes LuminTrack's `Vendor`. */
  clientName: string;

  /** End-employer's own id for the req (becomes `Job.atsId`). */
  customerRefNo?: string | null;
  location?: string | null;
  /** Vendor-side bill rate. iLabor sends as number; strings tolerated. */
  c2crate?: number | string | null;
  noOfPositions?: number | null;
  noOfSubmissions?: number | null;
  noOfActiveSubmissions?: number | null;
  /** Free-text duration like "12 months". */
  projectDuration?: string | null;

  /** ISO 8601 strings — e.g. "2026-05-22T16:25:14". */
  projectedStartDate?: string | null;
  projectedEndDate?: string | null;
  releaseDate?: string | null;
  createDate?: string | null;

  /** Free-text status: "Open" | "On Hold" | "Filled" | "Closed" | "Not Filled" | ... */
  requisitionStatus?: string | null;
  assignedTo?: string | null;
  accountManager?: string | null;
  alternateEmail?: string | null;
  /** e.g. "Contract position". */
  positionType?: string | null;
  department?: string | null;

  /** The extension may include other iLabor fields; preserved, not validated. */
  [extra: string]: unknown;
};

/** The full file envelope. */
export type IlaborImportFile = {
  source: typeof ILABOR_SOURCE_IDENTIFIER;
  version: typeof ILABOR_FORMAT_VERSION;
  /** ISO 8601 timestamp when the extension captured the grid. */
  capturedAt: string;
  /** iLabor's `iTotalRecords` if captured, for cross-checking row count. */
  totalRecords?: number;
  rows: IlaborImportRow[];
};
