/**
 * The kind of soft gate an action paused on, so the form can render the right
 * prompt without sniffing the error string. `true` is kept for back-compat with
 * simpler confirm flows (e.g. the candidate duplicate warning) that only need a
 * single yes/no.
 */
export type ConfirmKind =
  | "duplicate"
  | "ilabor_closed"
  | "ilabor_cap"
  | "not_assigned"
  | true;

/** Extra context for a paused gate, surfaced in the confirm prompt. */
export type ConfirmData = {
  /** iLabor cap value, for the cap gate. */
  cap?: number;
  /** Effective active-submission count, for the cap gate. */
  active?: number;
  /** The existing submission this one duplicates, for a "view it" link. */
  existingSubmissionId?: string;
  /** The job's display id, for the not-assigned / claim prompt. */
  jobDisplayId?: string;
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
};

export const EMPTY_FORM_STATE: FormState = {};
