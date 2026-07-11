import { getScopedPrisma } from "@/lib/session";

/**
 * Derives the team-lead name for a recruiter: the designated lead of the
 * recruiter's team. Returns null when the recruiter has no team or the team has
 * no active lead. Shared by the requirement actions and the job-create
 * requirement section.
 */
export async function deriveTeamLead(
  recruiterId: string | null,
): Promise<string | null> {
  if (!recruiterId) return null;
  const db = await getScopedPrisma();
  const recruiter = await db.user.findUnique({
    where: { id: recruiterId },
    select: {
      team: { select: { lead: { select: { fullName: true, isActive: true } } } },
    },
  });
  const lead = recruiter?.team?.lead;
  return lead?.isActive ? lead.fullName : null;
}
