/** Shared return shape for form-backed Server Actions used with `useActionState`. */
export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the action paused for the user to confirm (e.g. a duplicate warning). */
  needsConfirm?: boolean;
};

export const EMPTY_FORM_STATE: FormState = {};
