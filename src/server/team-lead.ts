import { prisma } from "@/server/db";

/**
 * Derives the team-lead name for a recruiter: the TEAM_LEAD user sharing the
 * recruiter's team label. Returns null when there's no clear lead. Shared by the
 * requirement actions and the job-create requirement section.
 */
export async function deriveTeamLead(
  recruiterId: string | null,
): Promise<string | null> {
  if (!recruiterId) return null;
  const recruiter = await prisma.user.findUnique({
    where: { id: recruiterId },
    select: { teamLabel: true },
  });
  if (!recruiter?.teamLabel) return null;
  const lead = await prisma.user.findFirst({
    where: { role: "TEAM_LEAD", isActive: true, teamLabel: recruiter.teamLabel },
    select: { fullName: true },
  });
  return lead?.fullName ?? null;
}
