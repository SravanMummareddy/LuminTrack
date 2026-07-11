/**
 * Restore-grade JSON backup. Includes every row from every model, with one
 * exception: `User.passwordHash` is stripped. Drive links, rates, and
 * sensitive document categories are all preserved — this dump is intended
 * for admin disaster-recovery, not third-party sharing.
 *
 * Output shape: `{ exportedAt, version, tables: { user: [...], job: [...], ... } }`.
 */
import type { ScopedPrisma } from "@/server/db";
import { getScopedPrisma } from "@/lib/session";

export type BackupJson = {
  exportedAt: string;
  // v2 added supportProvider, lookupOption, glossaryNote, customGlossaryTerm.
  version: 2;
  tables: Record<string, unknown[]>;
};

/** Builds the backup for ONE organization via the passed scoped client. The
 *  authed full-export route passes getScopedPrisma() (the manager's own org);
 *  the scheduled backup iterates active orgs and passes scopedPrisma(org.id),
 *  writing one snapshot per tenant. */
export async function buildBackupJson(db: ScopedPrisma): Promise<BackupJson> {
  const [
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
    db.user.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
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
    version: 2,
    tables: {
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
