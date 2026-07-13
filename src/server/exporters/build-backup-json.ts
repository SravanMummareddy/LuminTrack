/**
 * Restore-grade JSON backup. Includes every row from every model, with one
 * exception: `User.passwordHash` is stripped. Drive links, rates, and
 * sensitive document categories are all preserved — this dump is intended
 * for admin disaster-recovery, not third-party sharing.
 *
 * v3 (2026-07-13) added the tables the multi-tenancy migration made into required
 * FKs — organization, team, role, rolePermission, permission, referrer — plus the
 * user's governance columns (org/team/role/reportsTo/isPlatformAdmin/…). Without
 * them a restore FK-violates on the first table. See restore-backup.ts.
 *
 * Output shape: `{ exportedAt, version, tables: { organization: [...], user: [...], … } }`.
 */
import type { ScopedPrisma } from "@/server/db";
import { getScopedPrisma } from "@/lib/session";

export type BackupJson = {
  exportedAt: string;
  version: 3;
  tables: Record<string, unknown[]>;
};

/** Builds the backup for ONE organization via the passed scoped client + its id.
 *  The authed full-export route passes getScopedPrisma() + the caller's org; the
 *  scheduled backup iterates active orgs and passes scopedPrisma(org.id) + org.id,
 *  writing one snapshot per tenant. `orgId` is needed because the Organization
 *  table is the tenant boundary — the scope extension does NOT filter it, so we
 *  fetch this org explicitly rather than dumping every org. */
export async function buildBackupJson(
  db: ScopedPrisma,
  orgId: string,
): Promise<BackupJson> {
  const [
    organization,
    // Permission is the one global (non-tenant) table — the scope extension
    // leaves it unscoped, so this returns the whole catalog (fine: RolePermission
    // rows reference it by key, and restore uses skipDuplicates).
    permissions,
    roles,
    rolePermissions,
    referrers,
    teams,
    users,
    sources,
    clients,
    vendors,
    contacts,
    jobs,
    assignments,
    candidates,
    resumes,
    documents,
    submissions,
    placements,
    placementExtensions,
    supportProviders,
    lookupOptions,
    interviewRounds,
    benchConsultants,
    vendorRequirements,
    notes,
    activities,
    glossaryNotes,
    customGlossaryTerms,
  ] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.permission.findMany(),
    db.role.findMany(),
    db.rolePermission.findMany(),
    db.referrer.findMany(),
    db.team.findMany(),
    // omit only the password hash — every other column (incl. organizationId,
    // teamId, reportsToId, roleId, isPlatformAdmin, empId, notify flags) must
    // round-trip or a restored user has no org/team/role.
    db.user.findMany({ omit: { passwordHash: true } }),
    db.sisterCompanySource.findMany(),
    db.client.findMany(),
    db.vendor.findMany(),
    db.contact.findMany(),
    db.job.findMany(),
    db.jobAssignment.findMany(),
    db.candidate.findMany(),
    db.candidateResume.findMany(),
    db.candidateDocument.findMany(),
    db.submission.findMany(),
    db.placement.findMany(),
    db.placementExtension.findMany(),
    // SupportProvider must round-trip: InterviewRound.supportProviderId is a real
    // FK, so a restore that omits it FK-violates when re-inserting interview rounds.
    db.supportProvider.findMany(),
    db.lookupOption.findMany(),
    db.interviewRound.findMany(),
    db.benchConsultant.findMany(),
    db.vendorRequirement.findMany(),
    db.note.findMany(),
    db.activity.findMany(),
    db.glossaryNote.findMany(),
    db.customGlossaryTerm.findMany(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: 3,
    tables: {
      organization: organization ? [organization] : [],
      permission: permissions,
      role: roles,
      rolePermission: rolePermissions,
      referrer: referrers,
      team: teams,
      user: users,
      sisterCompanySource: sources,
      client: clients,
      vendor: vendors,
      contact: contacts,
      job: jobs,
      jobAssignment: assignments,
      candidate: candidates,
      candidateResume: resumes,
      candidateDocument: documents,
      submission: submissions,
      placement: placements,
      placementExtension: placementExtensions,
      supportProvider: supportProviders,
      lookupOption: lookupOptions,
      interviewRound: interviewRounds,
      benchConsultant: benchConsultants,
      vendorRequirement: vendorRequirements,
      note: notes,
      activity: activities,
      glossaryNote: glossaryNotes,
      customGlossaryTerm: customGlossaryTerms,
    },
  };
}

export type BackupPreflight = {
  totals: Record<string, number>;
  estimatedSizeKb: number;
};

export async function getBackupPreflight(): Promise<BackupPreflight> {
  const db = await getScopedPrisma();
  const [
    users,
    teams,
    roles,
    referrers,
    clients,
    vendors,
    sources,
    jobs,
    candidates,
    resumes,
    documents,
    submissions,
    placements,
    supportProviders,
    lookupOptions,
    interviewRounds,
    benchConsultants,
    vendorRequirements,
    notes,
    activities,
    glossaryNotes,
    customGlossaryTerms,
  ] = await Promise.all([
    db.user.count(),
    db.team.count(),
    db.role.count(),
    db.referrer.count(),
    db.client.count(),
    db.vendor.count(),
    db.sisterCompanySource.count(),
    db.job.count(),
    db.candidate.count(),
    db.candidateResume.count(),
    db.candidateDocument.count(),
    db.submission.count(),
    db.placement.count(),
    db.supportProvider.count(),
    db.lookupOption.count(),
    db.interviewRound.count(),
    db.benchConsultant.count(),
    db.vendorRequirement.count(),
    db.note.count(),
    db.activity.count(),
    db.glossaryNote.count(),
    db.customGlossaryTerm.count(),
  ]);

  const totals = {
    users,
    teams,
    roles,
    referrers,
    clients,
    vendors,
    sources,
    jobs,
    candidates,
    resumes,
    documents,
    submissions,
    placements,
    supportProviders,
    lookupOptions,
    interviewRounds,
    benchConsultants,
    vendorRequirements,
    notes,
    activities,
    glossaryNotes,
    customGlossaryTerms,
  };
  // Rough heuristic: ~1KB per row averaged across small + large models.
  const rowCount = Object.values(totals).reduce((a, b) => a + b, 0);
  return { totals, estimatedSizeKb: Math.max(1, rowCount) };
}
