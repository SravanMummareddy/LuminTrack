/**
 * The kind of soft gate an action paused on, so the form can render the right
 * prompt without sniffing the error string. `true` is kept for back-compat with
 * simpler confirm flows (e.g. the candidate duplicate warning) that only need a
 * single yes/no.
 */
export type ConfirmKind =
  | "duplicate"
  | "not_assigned"
  // Convert-a-requirement-to-submission warn+override gates (R2). Each is
  // overridable with a single `convertOverrideReason`.
  | "candidate_placed"
  | "archived_resume"
  | "zero_rates"
  | "bill_below_pay"
  // Soft block on save when the rate chain is broken (pay>bill, bill/pay>client).
  // Overridable with a free-text `rateOverrideReason`.
  | "rate_chain"
  // Soft block when the candidate is marked Not-interested / Do-not-contact.
  // Overridable with a free-text `candidateStatusOverrideReason` (both the
  // direct-submit and VPR-convert paths).
  | "candidate_status"
  // Soft warn when the candidate isn't on the active bench (Off bench / no bench
  // row) — submitting will re-add them to marketing. Overridable with a free-text
  // `benchOverrideReason` (both the direct-submit and VPR-convert paths).
  | "not_marketing"
  | true;

/**
 * One soft gate awaiting a reason, so the submission form can render every
 * applicable warning stacked at once (see `collectSubmissionGates`). Each kind
 * maps to a render block + its own reason field in the form.
 */
export type PendingGateKind =
  | "not_assigned"
  | "rate_chain"
  | "candidate_status"
  | "not_marketing"
  | "convert_warn"
  | "duplicate";

export type PendingGate = {
  kind: PendingGateKind;
  /** A ready-made human line for this gate (candidate_status). */
  message?: string;
  /** Broken rate-chain rungs (rate_chain) or convert warnings (convert_warn). */
  warnings?: string[];
  /** Existing submission to link, for the duplicate gate. */
  existingSubmissionId?: string;
};

/** Extra context for a paused gate, surfaced in the confirm prompt. */
export type ConfirmData = {
  /** The existing submission this one duplicates, for a "view it" link. */
  existingSubmissionId?: string;
  /** The job's display id, for the not-assigned / claim prompt. */
  jobDisplayId?: string;
  /** The specific broken-rate-chain warnings, for the rate_chain gate. */
  warnings?: string[];
};

/** Shared return shape for form-backed Server Actions used with `useActionState`. */
export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the action paused for the user to confirm (e.g. a duplicate warning). */
  needsConfirm?: ConfirmKind;
  /** Extra context for the paused gate (numbers, ids) shown in the prompt. */
  confirmData?: ConfirmData;
  /** Every soft gate that fired for a submission, shown stacked so the recruiter
   *  resolves them all in one pass instead of one round-trip per gate. */
  pendingGates?: PendingGate[];
  /**
   * Optional success message for a toast. Actions that don't redirect (status
   * change, note add, job status) set this so the client can confirm the save
   * — the app previously gave no feedback on these silent writes.
   */
  toast?: { title: string; description?: string };
  /** Set on a milestone worth celebrating (a candidate JOINED) so the form can
   *  fire a brief confetti burst on top of the success toast. */
  celebrate?: boolean;
  /** The résumé just created by an upload action — lets a caller (e.g. the
   *  submission form's inline upload) select it immediately. */
  createdResume?: { id: string; label: string };
};

export const EMPTY_FORM_STATE: FormState = {};
