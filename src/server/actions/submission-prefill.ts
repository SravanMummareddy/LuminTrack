"use server";

import { getOpenRequirementPrefill } from "@/server/queries/requirements";

/**
 * Client-callable wrapper around `getOpenRequirementPrefill` so the submission
 * form (open / candidate-locked modes, where the job is picked in the browser)
 * can pull the job's OPEN vendor-requirement terms — pay/bill/client rate,
 * engagement, vendor recruiter, team lead — the moment a job is selected.
 * Returns null when the job has no open requirement.
 */
export async function fetchSubmissionPrefill(jobId: string) {
  if (!jobId) return null;
  return getOpenRequirementPrefill(jobId);
}
