import { getScopedPrisma } from "@/lib/session";
import type { ScopedPrisma } from "@/server/db";

/** Whether this user leads at least one team (data-driven — there is no
 *  team-lead role/permission; a lead is just a user set as a Team's `leadId`). */
export async function leadsAnyTeam(
  db: ScopedPrisma,
  userId: string,
): Promise<boolean> {
  return (await db.team.count({ where: { leadId: userId } })) > 0;
}

/** The user-ids whose pending work rolls up under this lead: every member of
 *  every team they lead, plus the lead themselves (personal + team). Empty when
 *  they lead no team. A user can lead multiple teams (`teamsLed` is a list), so
 *  the ids are unioned. */
export async function ledTeamMemberIds(
  db: ScopedPrisma,
  userId: string,
): Promise<string[]> {
  const teams = await db.team.findMany({
    where: { leadId: userId },
    select: { members: { select: { id: true } } },
  });
  const ids = new Set<string>([userId]);
  for (const t of teams) for (const m of t.members) ids.add(m.id);
  return [...ids];
}

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

/**
 * Map of userId → their team's active-lead name, for every user that has one.
 * Powers the VPR form's client-side Team-lead auto-fill: picking a marketing
 * recruiter pre-selects their lead in the (required, editable) Team-lead field,
 * restoring the old "leave blank → derive from the recruiter" convenience.
 */
export async function teamLeadByRecruiter(): Promise<Record<string, string>> {
  const db = await getScopedPrisma();
  const users = await db.user.findMany({
    where: { team: { lead: { isActive: true } } },
    select: {
      id: true,
      team: { select: { lead: { select: { fullName: true } } } },
    },
  });
  const map: Record<string, string> = {};
  for (const u of users) {
    const name = u.team?.lead?.fullName;
    if (name) map[u.id] = name;
  }
  return map;
}
