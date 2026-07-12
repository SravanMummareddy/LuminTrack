import type { PrismaClient } from "@/generated/prisma/client";
// Import from the pure org-scope module, NOT `@/server/db` (which the test files
// mock, dropping this export and constructing the Neon client). org-scope.ts has
// no client construction, so the real extension is always available here.
import { orgScopeExtension } from "@/server/org-scope";

/** Wipe every table (except the migration ledger) between tests. Discovered
 *  dynamically so new models never need to be added here by hand. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Create a fresh tenant and return an org-scoped client for it. Every seed
 *  helper builds its graph through this, so all rows are auto-stamped with the
 *  org (tests run one org at a time — truncateAll wipes between them). */
export async function seedOrg(base: PrismaClient, slug = "test-org") {
  const org = await base.organization.create({
    data: { name: `Org ${slug}`, slug },
  });
  return { org, db: base.$extends(orgScopeExtension(org.id)) };
}

/** Minimal connected graph: admin user → client/vendor → candidate → job →
 *  one SELECTED submission. Enough to exercise the status-change cascades. */
export async function seedBasics(base: PrismaClient) {
  const { org, db: prisma } = await seedOrg(base);
  const user = await prisma.user.create({
    data: {
      fullName: "Test Admin",
      email: "admin@test.local",
      passwordHash: "x",
      role: "MANAGER",
    },
  });
  const [client, vendor] = await Promise.all([
    prisma.client.create({ data: { name: "Test Client" } }),
    prisma.vendor.create({ data: { name: "Test Vendor" } }),
  ]);
  const candidate = await prisma.candidate.create({
    data: {
      fullName: "Test Candidate",
      status: "AVAILABLE",
      createdById: user.id,
    },
  });
  const job = await prisma.job.create({
    data: {
      title: "Senior Engineer",
      clientId: client.id,
      vendorId: vendor.id,
      createdById: user.id,
    },
  });
  const submission = await prisma.submission.create({
    data: {
      status: "SELECTED",
      candidateId: candidate.id,
      jobId: job.id,
      submittedById: user.id,
      // Waive the résumé so the SB-3 forward-advance gate (#84) doesn't block the
      // status-cascade tests, which are about JOINED→placement, not résumés.
      resumeWaivedAt: new Date(),
    },
  });
  return { org, db: prisma, user, client, vendor, candidate, job, submission };
}

/** Loose actors for the createSubmission gate tests: an admin, an unassigned
 *  recruiter, a candidate, and a client/vendor pair. Jobs are created per-test
 *  via the returned ids. */
export async function seedSubmissionScenario(base: PrismaClient) {
  const { org, db: prisma } = await seedOrg(base);
  const [admin, recruiter] = await Promise.all([
    prisma.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "MANAGER" },
    }),
    prisma.user.create({
      data: { fullName: "Rec One", email: "rec1@test.local", passwordHash: "x", role: "RECRUITER" },
    }),
  ]);
  const [client, vendor] = await Promise.all([
    prisma.client.create({ data: { name: "Test Client" } }),
    prisma.vendor.create({ data: { name: "Test Vendor" } }),
  ]);
  const candidate = await prisma.candidate.create({
    data: { fullName: "Bench Candidate", status: "AVAILABLE", createdById: admin.id },
  });
  return { org, db: prisma, admin, recruiter, client, vendor, candidate };
}

/** A live SUBMITTED submission owned by `recruiterA`, plus an admin, a
 *  re-attribution target `recruiterB`, and one résumé in the candidate's
 *  library. For the updateSubmission edit tests. The submission's submittedAt
 *  is pinned to a fixed minute so a no-op edit can re-post it unchanged. */
export async function seedSubmissionEditScenario(base: PrismaClient) {
  const { org, db: prisma } = await seedOrg(base);
  const [admin, recruiterA, recruiterB] = await Promise.all([
    prisma.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "MANAGER" },
    }),
    prisma.user.create({
      data: { fullName: "Rec A", email: "reca@test.local", passwordHash: "x", role: "RECRUITER" },
    }),
    prisma.user.create({
      data: { fullName: "Rec B", email: "recb@test.local", passwordHash: "x", role: "RECRUITER" },
    }),
  ]);
  const [client, vendor] = await Promise.all([
    prisma.client.create({ data: { name: "Test Client" } }),
    prisma.vendor.create({ data: { name: "Test Vendor" } }),
  ]);
  const candidate = await prisma.candidate.create({
    data: { fullName: "Edit Candidate", status: "AVAILABLE", createdById: admin.id },
  });
  const job = await prisma.job.create({
    data: {
      title: "Senior Engineer",
      clientId: client.id,
      vendorId: vendor.id,
      createdById: admin.id,
    },
  });
  const resume = await prisma.candidateResume.create({
    data: {
      candidateId: candidate.id,
      label: "Primary",
      blobPathname: "resumes/test/primary.pdf",
      blobUrl: "https://blob.test/primary.pdf",
      contentType: "application/pdf",
    },
  });
  const submission = await prisma.submission.create({
    data: {
      status: "SUBMITTED",
      submissionNotes: "Original note",
      submittedAt: new Date("2026-06-01T10:00"), // local; matches the edit form's string
      candidateId: candidate.id,
      jobId: job.id,
      submittedById: recruiterA.id,
    },
  });
  return { org, db: prisma, admin, recruiterA, recruiterB, client, vendor, candidate, job, resume, submission };
}

/** A placement owned by `recruiterA` (recruiter-of-record), plus an admin and an
 *  unrelated `recruiterB`. For the rate-permission gating tests. */
export async function seedPlacementScenario(base: PrismaClient) {
  const { org, db: prisma } = await seedOrg(base);
  const [admin, recruiterA, recruiterB] = await Promise.all([
    prisma.user.create({
      data: { fullName: "Admin", email: "admin@test.local", passwordHash: "x", role: "MANAGER" },
    }),
    prisma.user.create({
      data: { fullName: "Rec A", email: "reca@test.local", passwordHash: "x", role: "RECRUITER" },
    }),
    prisma.user.create({
      data: { fullName: "Rec B", email: "recb@test.local", passwordHash: "x", role: "RECRUITER" },
    }),
  ]);
  const [client, vendor] = await Promise.all([
    prisma.client.create({ data: { name: "Test Client" } }),
    prisma.vendor.create({ data: { name: "Test Vendor" } }),
  ]);
  const candidate = await prisma.candidate.create({
    data: { fullName: "Placed Candidate", status: "PLACED", createdById: admin.id },
  });
  const job = await prisma.job.create({
    data: {
      title: "Senior Engineer",
      clientId: client.id,
      vendorId: vendor.id,
      createdById: admin.id,
    },
  });
  const submission = await prisma.submission.create({
    data: {
      status: "JOINED",
      candidateId: candidate.id,
      jobId: job.id,
      submittedById: recruiterA.id, // recruiter-of-record
    },
  });
  const placement = await prisma.placement.create({
    data: {
      startDate: new Date("2026-06-01"),
      billRate: 90,
      payRate: 70,
      submissionId: submission.id,
      candidateId: candidate.id,
      jobId: job.id,
    },
  });
  return { org, db: prisma, admin, recruiterA, recruiterB, client, vendor, candidate, job, submission, placement };
}
