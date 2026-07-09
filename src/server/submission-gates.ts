import type { PendingGate } from "@/lib/form-state";
import type { CreateSubmissionResult } from "@/server/submission-create";

/** Map a create-time result (a dup/iLabor gate that slipped in under the
 *  advisory lock after the up-front pre-check) to a stacked gate, so it's
 *  surfaced the same way as the pre-checked ones. */
export function gatesFromCreateResult(
  result: CreateSubmissionResult,
): PendingGate[] {
  if (result.kind === "duplicate")
    return [{ kind: "duplicate", existingSubmissionId: result.existingId }];
  if (result.kind === "ilabor_closed") return [{ kind: "ilabor_closed" }];
  if (result.kind === "ilabor_cap")
    return [{ kind: "ilabor_cap", cap: result.cap, active: result.active }];
  return [];
}

/**
 * Collects EVERY soft gate that still needs the recruiter's attention for one
 * submission, so the form can show them all at once (stacked) instead of one
 * per round-trip. A gate is included only when its condition holds AND its
 * override reason is still blank — supply a reason and it drops off the list.
 *
 * Pure + synchronous: the caller loads the data (candidate/bench status, job
 * signals, duplicate lookup, iLabor counts) and passes the results in, so this
 * is trivially unit-testable and shared by the direct-submit and VPR-convert
 * actions. The order here is the order the blocks render in.
 */
export function collectSubmissionGates(input: {
  isConvert: boolean;
  /** Direct path: assigned/admin/claimed. Convert path: always true. */
  assignmentOk: boolean;
  /** Broken rate-chain rungs (direct path). Empty to skip. */
  rateWarnings: string[];
  /** The candidate's blocking status label (Not-interested / Do-not-contact), or null. */
  candidateStatusLabel: string | null;
  /** Candidate is off the active bench (or has no bench row). */
  notMarketed: boolean;
  /** Convert-only warnings (placed / archived résumé / rates pending / bill<pay). Empty to skip. */
  convertWarnings: string[];
  /** The id of an existing submission for the same (candidate, job), or null. */
  duplicateExistingId: string | null;
  /** iLabor has closed submissions on this requisition. */
  ilaborClosed: boolean;
  /** iLabor cap reached, with the cap + effective active count. */
  ilaborCap: { cap: number; active: number } | null;
  /** Override reasons the recruiter has already supplied. */
  reasons: {
    rate: string;
    candidateStatus: string;
    bench: string;
    convert: string;
    duplicate: string;
    ilabor: string;
  };
}): PendingGate[] {
  const gates: PendingGate[] = [];
  const r = input.reasons;

  if (!input.assignmentOk) gates.push({ kind: "not_assigned" });

  if (input.rateWarnings.length > 0 && !r.rate)
    gates.push({ kind: "rate_chain", warnings: input.rateWarnings });

  if (input.candidateStatusLabel && !r.candidateStatus)
    gates.push({
      kind: "candidate_status",
      message: `Candidate is marked "${input.candidateStatusLabel}".`,
    });

  if (input.notMarketed && !r.bench) gates.push({ kind: "not_marketing" });

  if (input.convertWarnings.length > 0 && !r.convert)
    gates.push({ kind: "convert_warn", warnings: input.convertWarnings });

  if (input.duplicateExistingId && !r.duplicate)
    gates.push({
      kind: "duplicate",
      existingSubmissionId: input.duplicateExistingId,
    });

  if (input.ilaborClosed && !r.ilabor) gates.push({ kind: "ilabor_closed" });

  if (input.ilaborCap && !r.ilabor)
    gates.push({
      kind: "ilabor_cap",
      cap: input.ilaborCap.cap,
      active: input.ilaborCap.active,
    });

  return gates;
}
