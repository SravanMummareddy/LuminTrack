import type { JobStatus } from "@/generated/prisma/enums";

/**
 * Job status transitions for the quick-action buttons on the job detail page.
 *
 * Unlike the submission pipeline (a linear advance), a job's status is a small
 * set of states you toggle between: Open, On Hold, Closed, Filled, Cancelled.
 * `jobStatusActions(status)` returns the moves that make sense from the current
 * status, in display order, each with a button tone and whether it should ask
 * for confirmation first. Pure + unit-tested; no server imports.
 */

export type JobActionTone = "primary" | "secondary" | "hold" | "danger";

export type JobStatusAction = {
  /** The status this button transitions to. */
  next: JobStatus;
  /** Button text. */
  label: string;
  tone: JobActionTone;
  /** Confirm before applying (irreversible-feeling moves). */
  confirm?: boolean;
};

const REOPEN: JobStatusAction = {
  next: "OPEN",
  label: "Reopen",
  tone: "primary",
};
const ON_HOLD: JobStatusAction = {
  next: "ON_HOLD",
  label: "Put on hold",
  tone: "hold",
};
const MARK_FILLED: JobStatusAction = {
  next: "FILLED",
  label: "Mark filled",
  tone: "primary",
};
const CLOSE: JobStatusAction = {
  next: "CLOSED",
  label: "Close",
  tone: "secondary",
};
const CANCEL: JobStatusAction = {
  next: "CANCELLED",
  label: "Cancel job",
  tone: "danger",
  confirm: true,
};

export function jobStatusActions(status: JobStatus): JobStatusAction[] {
  switch (status) {
    case "OPEN":
      return [MARK_FILLED, ON_HOLD, CLOSE, CANCEL];
    case "ON_HOLD":
      return [REOPEN, MARK_FILLED, CLOSE, CANCEL];
    case "CLOSED":
    case "FILLED":
    case "CANCELLED":
      // Terminal-ish states — the only sensible move is to reopen.
      return [REOPEN];
    default:
      return [REOPEN];
  }
}
