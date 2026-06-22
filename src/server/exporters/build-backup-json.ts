/**
 * Restore-grade JSON backup. Includes every row from every model, with one
 * exception: `User.passwordHash` is stripped. Drive links, rates, and
 * sensitive document categories are all preserved — this dump is intended
 * for admin disaster-recovery, not third-party sharing.
 *
 * Output shape: `{ exportedAt, version, tables: { user: [...], job: [...], ... } }`.
 */
import { prisma } from "@/server/db";

export type BackupJson = {
  exportedAt: string;
  version: 1;
  tables: Record<string, unknown[]>;
};

export async function buildBackupJson(): Promise<BackupJson> {
  const [
    users,
    sources,
    portals,
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
    interviewRounds,
    benchConsultants,
    vendorRequirements,
    notes,
    activities,
  ] = await Promise.all([
    prisma.user.findMany({
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
    prisma.sisterCompanySource.findMany(),
    prisma.jobPortal.findMany(),
    prisma.client.findMany(),
    prisma.vendor.findMany(),
    prisma.contact.findMany(),
    prisma.job.findMany(),
    prisma.jobAssignment.findMany(),
    prisma.candidate.findMany(),
    prisma.candidateResume.findMany(),
    prisma.candidateDocument.findMany(),
    prisma.submission.findMany(),
    prisma.placement.findMany(),
    prisma.placementExtension.findMany(),
    prisma.interviewRound.findMany(),
    prisma.benchConsultant.findMany(),
    prisma.vendorRequirement.findMany(),
    prisma.note.findMany(),
    prisma.activity.findMany(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    tables: {
      user: users,
      sisterCompanySource: sources,
      jobPortal: portals,
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
      interviewRound: interviewRounds,
      benchConsultant: benchConsultants,
      vendorRequirement: vendorRequirements,
      note: notes,
      activity: activities,
    },
  };
}

export type BackupPreflight = {
  totals: Record<string, number>;
  estimatedSizeKb: number;
};

export async function getBackupPreflight(): Promise<BackupPreflight> {
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
    interviewRounds,
    benchConsultants,
    vendorRequirements,
    notes,
    activities,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.vendor.count(),
    prisma.sisterCompanySource.count(),
    prisma.job.count(),
    prisma.candidate.count(),
    prisma.candidateResume.count(),
    prisma.candidateDocument.count(),
    prisma.submission.count(),
    prisma.placement.count(),
    prisma.interviewRound.count(),
    prisma.benchConsultant.count(),
    prisma.vendorRequirement.count(),
    prisma.note.count(),
    prisma.activity.count(),
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
    interviewRounds,
    benchConsultants,
    vendorRequirements,
    notes,
    activities,
  };
  // Rough heuristic: ~1KB per row averaged across small + large models.
  const rowCount = Object.values(totals).reduce((a, b) => a + b, 0);
  return { totals, estimatedSizeKb: Math.max(1, rowCount) };
}
