import type {
  JobStatus,
  SubmissionStatus,
  InterviewType,
  InterviewResult,
} from "@/generated/prisma/enums";

/** Display order for job statuses across filters, forms, and the pipeline. */
export const JOB_STATUSES: JobStatus[] = [
  "OPEN",
  "ON_HOLD",
  "CLOSED",
  "FILLED",
  "CANCELLED",
];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  OPEN: "Open",
  ON_HOLD: "On Hold",
  CLOSED: "Closed",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
};

export type BadgeTone = "slate" | "green" | "amber" | "red" | "blue" | "indigo";

export const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  OPEN: "green",
  ON_HOLD: "amber",
  CLOSED: "slate",
  FILLED: "blue",
  CANCELLED: "red",
};

/** Display order for submission statuses across filters, forms, and the pipeline. */
export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "SUBMITTED",
  "RESUME_PICKED",
  "VENDOR_SCREENING_CALL",
  "CLIENT_INTERVIEW",
  "SELECTED",
  "REJECTED",
  "ON_HOLD",
  "OFFER_RELEASED",
  "JOINED",
];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  SUBMITTED: "Submitted",
  RESUME_PICKED: "Resume Picked",
  VENDOR_SCREENING_CALL: "Vendor Screening Call",
  CLIENT_INTERVIEW: "Client Interview",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  ON_HOLD: "On Hold",
  OFFER_RELEASED: "Offer Released",
  JOINED: "Joined",
};

export const SUBMISSION_STATUS_TONE: Record<SubmissionStatus, BadgeTone> = {
  SUBMITTED: "slate",
  RESUME_PICKED: "blue",
  VENDOR_SCREENING_CALL: "blue",
  CLIENT_INTERVIEW: "indigo",
  SELECTED: "green",
  REJECTED: "red",
  ON_HOLD: "amber",
  OFFER_RELEASED: "indigo",
  JOINED: "green",
};

/**
 * Visual submission pipeline (spec §9.8). Stage index 4 ("Decision") is the
 * Selected / Rejected / On Hold branch — the pipeline page swaps in the live
 * status label there. SUBMISSION_STAGE_INDEX maps each status to its stage.
 */
export const SUBMISSION_PIPELINE: string[] = [
  "Submitted",
  "Resume Picked",
  "Vendor Screening Call",
  "Client Interview",
  "Decision",
  "Offer Released",
  "Joined",
];

export const SUBMISSION_STAGE_INDEX: Record<SubmissionStatus, number> = {
  SUBMITTED: 0,
  RESUME_PICKED: 1,
  VENDOR_SCREENING_CALL: 2,
  CLIENT_INTERVIEW: 3,
  SELECTED: 4,
  REJECTED: 4,
  ON_HOLD: 4,
  OFFER_RELEASED: 5,
  JOINED: 6,
};

/** Display order for interview types across forms and tables. */
export const INTERVIEW_TYPES: InterviewType[] = [
  "VENDOR_SCREENING",
  "CLIENT_INTERVIEW",
  "MANAGER_ROUND",
  "HR_ROUND",
  "FINAL_ROUND",
  "OTHER",
];

export const INTERVIEW_TYPE_LABEL: Record<InterviewType, string> = {
  VENDOR_SCREENING: "Vendor Screening",
  CLIENT_INTERVIEW: "Client Interview",
  MANAGER_ROUND: "Manager Round",
  HR_ROUND: "HR Round",
  FINAL_ROUND: "Final Round",
  OTHER: "Other",
};

/** Display order for interview round results. */
export const INTERVIEW_RESULTS: InterviewResult[] = [
  "WAITING",
  "NEED_ANOTHER_ROUND",
  "SELECTED",
  "REJECTED",
  "ON_HOLD",
  "COMPLETED",
];

export const INTERVIEW_RESULT_LABEL: Record<InterviewResult, string> = {
  WAITING: "Waiting",
  NEED_ANOTHER_ROUND: "Need Another Round",
  SELECTED: "Selected",
  REJECTED: "Rejected",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

export const INTERVIEW_RESULT_TONE: Record<InterviewResult, BadgeTone> = {
  WAITING: "slate",
  NEED_ANOTHER_ROUND: "amber",
  SELECTED: "green",
  REJECTED: "red",
  ON_HOLD: "amber",
  COMPLETED: "blue",
};

/**
 * Preset reasons offered on a status change (mainly Rejected / On Hold). Plain
 * strings, not a DB enum, so the list can evolve without a migration.
 */
export const STATUS_CHANGE_REASONS = [
  "CLIENT_FEEDBACK",
  "VENDOR_FEEDBACK",
  "RATE_MISMATCH",
  "CANDIDATE_WITHDREW",
  "CANDIDATE_UNRESPONSIVE",
  "POSITION_CLOSED",
  "AWAITING_DECISION",
  "OTHER",
] as const;

export type StatusChangeReason = (typeof STATUS_CHANGE_REASONS)[number];

export const STATUS_CHANGE_REASON_LABEL: Record<StatusChangeReason, string> = {
  CLIENT_FEEDBACK: "Client feedback",
  VENDOR_FEEDBACK: "Vendor / screening feedback",
  RATE_MISMATCH: "Rate or budget mismatch",
  CANDIDATE_WITHDREW: "Candidate withdrew",
  CANDIDATE_UNRESPONSIVE: "Candidate unresponsive",
  POSITION_CLOSED: "Position closed or cancelled",
  AWAITING_DECISION: "Awaiting decision",
  OTHER: "Other",
};
