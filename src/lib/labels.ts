import type {
  JobStatus,
  SubmissionStatus,
  InterviewType,
  InterviewResult,
  WorkMode,
  JobPriority,
  CandidateStatus,
  PlacementStatus,
  PlacementEndReason,
  BenchPriority,
  BenchMarketingStatus,
  BenchEngagement,
  RequirementStatus,
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

export const WORK_MODES: WorkMode[] = ["REMOTE", "HYBRID", "ONSITE"];
export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "Onsite",
};

export const JOB_PRIORITIES: JobPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];
export const JOB_PRIORITY_LABEL: Record<JobPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
export const JOB_PRIORITY_TONE: Record<JobPriority, BadgeTone> = {
  LOW: "slate",
  MEDIUM: "blue",
  HIGH: "amber",
  CRITICAL: "red",
};

// §B4 — candidate engagement state. Independent of `isActive` soft-delete.
export const CANDIDATE_STATUSES: CandidateStatus[] = [
  "AVAILABLE",
  "PLACED",
  "NOT_INTERESTED",
  "DO_NOT_CONTACT",
];
export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  AVAILABLE: "Available",
  PLACED: "Placed",
  NOT_INTERESTED: "Not interested",
  DO_NOT_CONTACT: "Do not contact",
};
export const CANDIDATE_STATUS_TONE: Record<CandidateStatus, BadgeTone> = {
  AVAILABLE: "green",
  PLACED: "blue",
  NOT_INTERESTED: "amber",
  DO_NOT_CONTACT: "red",
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
  "OFFER_ACCEPTED",
  "JOINED",
  "BACKED_OUT",
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
  OFFER_ACCEPTED: "Offer Accepted",
  JOINED: "Joined",
  BACKED_OUT: "Backed Out",
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
  OFFER_ACCEPTED: "green",
  JOINED: "green",
  BACKED_OUT: "red",
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
  "Offer Accepted",
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
  OFFER_ACCEPTED: 6,
  JOINED: 7,
  // Terminal negative outcome (parallel to REJECTED). Collapses into the
  // "Decision" branch of the visual pipeline rather than getting its own stage.
  BACKED_OUT: 4,
};

// ─── Job source ──────────────────────────────────────────────────────────────

/** Select sentinel for a manually-typed job source (vs. a managed source FK). */
export const OTHER_SOURCE = "__OTHER__";

/**
 * A job's display source — managed source name, free-text fallback, or the
 * external portal name if the job was imported (e.g. "Randstad iLabor").
 */
export function jobSourceLabel(job: {
  sisterCompanySource: { name: string } | null;
  sourceOther: string | null;
  portal?: { name: string } | null;
}): string {
  return (
    job.sisterCompanySource?.name ??
    job.sourceOther ??
    job.portal?.name ??
    "—"
  );
}

// ─── Interview mode & platform ───────────────────────────────────────────────

/**
 * How an interview round is conducted. Plain strings (not a DB enum) so the
 * list can evolve without a migration — see InterviewRound in the schema.
 */
export const INTERVIEW_MODES = ["IN_PERSON", "PHONE", "VIDEO"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

export const INTERVIEW_MODE_LABEL: Record<InterviewMode, string> = {
  IN_PERSON: "In person",
  PHONE: "Phone call",
  VIDEO: "Video call",
};

/** Video platform — only meaningful when the interview mode is VIDEO. */
export const INTERVIEW_PLATFORMS = [
  "MICROSOFT_TEAMS",
  "GOOGLE_MEET",
  "ZOOM",
  "OTHER",
] as const;
export type InterviewPlatform = (typeof INTERVIEW_PLATFORMS)[number];

export const INTERVIEW_PLATFORM_LABEL: Record<InterviewPlatform, string> = {
  MICROSOFT_TEAMS: "Microsoft Teams",
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  OTHER: "Other",
};

/** Display label for an interview round's mode, with the platform for video calls. */
export function interviewModeLabel(
  mode: string | null,
  platform: string | null,
): string {
  if (!mode) return "—";
  const modeText = INTERVIEW_MODE_LABEL[mode as InterviewMode] ?? mode;
  if (mode === "VIDEO" && platform) {
    const platformText =
      INTERVIEW_PLATFORM_LABEL[platform as InterviewPlatform] ?? platform;
    return `${modeText} · ${platformText}`;
  }
  return modeText;
}

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

/**
 * Preset reasons offered when a recruiter overrides a submission gate
 * (duplicate / iLabor closed / iLabor cap). Plain strings, not a DB enum, so
 * the list can evolve without a migration — same pattern as
 * STATUS_CHANGE_REASONS. Persisted into the `CANDIDATE_SUBMITTED` audit note
 * so overrides become analyzable instead of free text.
 */
export const OVERRIDE_REASONS = [
  "ROLE_REBOOTED",
  "PRIOR_CANCELLED",
  "MANAGER_APPROVED",
  "CLIENT_REQUESTED",
  "DATA_OUT_OF_DATE",
  "OTHER",
] as const;

export type OverrideReason = (typeof OVERRIDE_REASONS)[number];

export const OVERRIDE_REASON_LABEL: Record<OverrideReason, string> = {
  ROLE_REBOOTED: "Role was rebooted",
  PRIOR_CANCELLED: "Prior submission cancelled",
  MANAGER_APPROVED: "Manager approved",
  CLIENT_REQUESTED: "Client / vendor requested",
  DATA_OUT_OF_DATE: "iLabor data is out of date",
  OTHER: "Other",
};

// R4.2 — placement lifecycle labels.
export const PLACEMENT_STATUSES: PlacementStatus[] = [
  "ACTIVE",
  "EXTENDED",
  "ENDED",
  "TERMINATED",
];
export const PLACEMENT_STATUS_LABEL: Record<PlacementStatus, string> = {
  ACTIVE: "Active",
  EXTENDED: "Extended",
  ENDED: "Ended",
  TERMINATED: "Terminated",
};
export const PLACEMENT_STATUS_TONE: Record<PlacementStatus, BadgeTone> = {
  ACTIVE: "green",
  EXTENDED: "blue",
  ENDED: "slate",
  TERMINATED: "red",
};

export const PLACEMENT_END_REASONS: PlacementEndReason[] = [
  "COMPLETED",
  "TERMINATED_BY_CLIENT",
  "RESIGNED",
  "PERFORMANCE",
  "OTHER",
];
export const PLACEMENT_END_REASON_LABEL: Record<PlacementEndReason, string> = {
  COMPLETED: "Completed",
  TERMINATED_BY_CLIENT: "Terminated by client",
  RESIGNED: "Resigned",
  PERFORMANCE: "Performance",
  OTHER: "Other",
};

/** Industry-typical floor for contract-staffing margin. Below this, the Margin %
 * column renders amber on the Placements list. */
export const MARGIN_AMBER_THRESHOLD_PCT = 15;

// ─── Bench-Sales roster ──────────────────────────────────────────────────────

export const BENCH_PRIORITIES: BenchPriority[] = ["HIGH", "SECOND"];
export const BENCH_PRIORITY_LABEL: Record<BenchPriority, string> = {
  HIGH: "High Priority",
  SECOND: "Second Priority",
};
export const BENCH_PRIORITY_TONE: Record<BenchPriority, BadgeTone> = {
  HIGH: "red",
  SECOND: "amber",
};

export const BENCH_MARKETING_STATUSES: BenchMarketingStatus[] = [
  "ACTIVE",
  "PAUSED",
  "PLACED",
  "INACTIVE",
];
export const BENCH_MARKETING_STATUS_LABEL: Record<BenchMarketingStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  PLACED: "Placed",
  INACTIVE: "Inactive",
};
export const BENCH_MARKETING_STATUS_TONE: Record<BenchMarketingStatus, BadgeTone> = {
  ACTIVE: "green",
  PAUSED: "amber",
  PLACED: "blue",
  INACTIVE: "slate",
};

export const BENCH_ENGAGEMENTS: BenchEngagement[] = ["C2C", "W2"];
export const BENCH_ENGAGEMENT_LABEL: Record<BenchEngagement, string> = {
  C2C: "C2C",
  W2: "W2",
};

// ─── Vendor Portal Requirements ──────────────────────────────────────────────

export const REQUIREMENT_STATUSES: RequirementStatus[] = [
  "OPEN",
  "CONVERTED",
  "CANCELLED",
];
export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  OPEN: "Open",
  CONVERTED: "Converted",
  CANCELLED: "Cancelled",
};
export const REQUIREMENT_STATUS_TONE: Record<RequirementStatus, BadgeTone> = {
  OPEN: "green",
  CONVERTED: "blue",
  CANCELLED: "slate",
};
