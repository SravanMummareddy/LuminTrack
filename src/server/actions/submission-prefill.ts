"use server";

import { requireUser } from "@/lib/session";
import { getOpenRequirementPrefill } from "@/server/queries/requirements";

/**
 * Client-callable wrapper around `getOpenRequirementPrefill` so the submission
 * form (open / candidate-locked modes, where the job is picked in the browser)
 * can pull the job's OPEN vendor-requirement terms — pay/bill/client rate,
 * engagement, vendor recruiter, team lead — the moment a job is selected.
 * Returns null when the job has no open requirement.
 *
 * Server actions are ungated POST endpoints, so this MUST authenticate: the
 * requirement terms it returns are team-lead-scoped commercial data and would
 * otherwise leak the full rate chain to any (even unauthenticated) caller.
 */
export async function fetchSubmissionPrefill(jobId: string) {
  await requireUser();
  if (!jobId) return null;
  return getOpenRequirementPrefill(jobId);
}
